#!/usr/bin/env ruby
# Download INPI RPI Marcas XML issues and report dispatches for tracked processes
# and marks matching a pattern that were published for opposition (IPAS009).
# Usage: check-inpi-rpi.rb [--rpi N]... [--latest N] [--file RM.xml]... [--output DIR]
#        [--processes LIST] [--pattern REGEX] [--classes LIST]
# Defaults come from INPI_PROCESSES, INPI_WATCH_PATTERN and INPI_WATCH_CLASSES.
# The pattern matches the mark name uppercased, without accents, spaces or
# punctuation. An empty class list matches every class.

require "cgi"
require "date"
require "fileutils"
require "net/http"
require "optparse"
require "tmpdir"

module InpiRpi
  BASE_URL = "https://revistas.inpi.gov.br/txt/RM%d.zip".freeze
  REFERENCE_NUMBER = 2913
  REFERENCE_DATE = Date.new(2026, 11, 3)
  PROCESS_PATTERN = %r{<processo\b([^>]*?)(?:/>|>(.*?)</processo>)}m
  DISPATCH_PATTERN = %r{<despacho\b([^>]*?)(?:/>|>(.*?)</despacho>)}m
  ACTIONS = {
    "IPAS005" => "Exigência formal: cumprir em 5 dias contados do 1º dia útil após a publicação (serviço 338).",
    "IPAS009" => "Publicado para oposição: começa o prazo de 60 dias para oposição de terceiros.",
    "IPAS024" => "Indeferimento: recurso em 60 dias.",
    "IPAS029" => "Deferimento: 1º decênio e certificado são automáticos e gratuitos para depósitos 389 após 20/09/2025.",
    "IPAS136" => "Exigência de mérito: cumprir no prazo publicado.",
    "IPAS142" => "Sobrestamento do exame: verificar a anterioridade citada.",
    "IPAS158" => "Concessão: registro vigente por 10 anos; baixar o certificado.",
    "IPAS395" => "Exigência de pagamento: pagar no prazo publicado.",
    "IPAS423" => "Oposição notificada: manifestação opcional em 60 dias (serviço 339)."
  }.freeze

  module_function

  def attribute(attributes, name)
    value = attributes[/\b#{Regexp.escape(name)}="([^"]*)"/, 1]
    value && CGI.unescapeHTML(value)
  end

  def element(body, name)
    value = body.to_s[%r{<#{name}\b[^>]*>(.*?)</#{name}>}m, 1]
    value && CGI.unescapeHTML(value.strip)
  end

  def normalize(text)
    text.to_s.unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").upcase.gsub(/[^A-Z0-9]/, "")
  end

  def parse(xml)
    header = xml[/<revista\b([^>]*)>/, 1].to_s
    processes = xml.scan(PROCESS_PATTERN).map do |attributes, body|
      {
        number: attribute(attributes, "numero"),
        filed_at: attribute(attributes, "data-deposito"),
        mark: element(body.to_s[%r{<marca\b.*?</marca>}m], "nome"),
        presentation: attribute(body.to_s[/<marca\b[^>]*>/].to_s, "apresentacao"),
        holders: body.to_s.scan(/<titular\b([^>]*)>/).map { |(holder)| attribute(holder, "nome-razao-social") }.compact,
        classes: body.to_s.scan(/<classe-nice\b[^>]*codigo="([^"]*)"/).flatten,
        dispatches: body.to_s.scan(DISPATCH_PATTERN).map do |dispatch, text|
          { code: attribute(dispatch, "codigo"), name: attribute(dispatch, "nome"), text: element(text, "texto-complementar") }
        end
      }
    end
    { number: attribute(header, "numero"), date: attribute(header, "data"), processes: processes }
  end

  def findings(issue, processes:, pattern:, classes:)
    own = issue[:processes].select { |process| processes.include?(process[:number]) }
    similar = issue[:processes].select do |process|
      !processes.include?(process[:number]) &&
        process[:dispatches].any? { |dispatch| dispatch[:code] == "IPAS009" } &&
        pattern && normalize(process[:mark]).match?(pattern) &&
        (classes.empty? || (process[:classes] & classes).any?)
    end
    { own: own, similar: similar }
  end

  def report(issue, result)
    lines = ["# INPI: RPI #{issue[:number]} (#{issue[:date]})", ""]
    if result[:own].any?
      lines << "## Processos acompanhados" << ""
      result[:own].each do |process|
        lines << "### Processo #{process[:number]}#{process[:mark] ? " – #{process[:mark]}" : ''}" << ""
        process[:dispatches].each do |dispatch|
          lines << "- **#{dispatch[:code]}** – #{dispatch[:name]}"
          lines << "  - Ação: #{ACTIONS[dispatch[:code]]}" if ACTIONS.key?(dispatch[:code])
          lines << "  - Complemento: #{dispatch[:text]}" if dispatch[:text] && !dispatch[:text].empty?
        end
        lines << ""
      end
    end
    if result[:similar].any?
      lines << "## Marcas semelhantes publicadas para oposição" << ""
      lines << "Prazo de oposição: 60 dias a partir de #{issue[:date]} (serviço 332)." << ""
      lines << "| Processo | Marca | Apresentação | Classes | Titular |" << "|---|---|---|---|---|"
      result[:similar].each do |process|
        cells = [process[:number], process[:mark], process[:presentation], process[:classes].join(", "), process[:holders].join("; ")]
        lines << "| #{cells.map { |cell| cell.to_s.gsub('|', '\\|') }.join(' | ')} |"
      end
      lines << ""
    end
    lines << "Fonte: #{format(BASE_URL, issue[:number].to_i)} e https://busca.inpi.gov.br/pePI/"
    lines.join("\n") + "\n"
  end

  def available?(number)
    uri = URI(format(BASE_URL, number))
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 30, read_timeout: 60) do |http|
      http.head(uri.request_uri, "User-Agent" => "Mozilla/5.0")
    end
    response.is_a?(Net::HTTPOK)
  end

  def latest(count, today: Date.today)
    expected = REFERENCE_NUMBER + ((today - REFERENCE_DATE).to_i / 7)
    newest = (expected - 3..expected + 1).to_a.reverse.find { |number| available?(number) }
    abort "No recent RPI Marcas XML is available near RPI #{expected}" unless newest
    (newest - count + 1..newest).to_a
  end

  def download(number, directory)
    uri = URI(format(BASE_URL, number))
    archive = File.join(directory, "RM#{number}.zip")
    Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 30, read_timeout: 300) do |http|
      http.request_get(uri.request_uri, "User-Agent" => "Mozilla/5.0") do |response|
        abort "RPI #{number} download failed with HTTP #{response.code}" unless response.is_a?(Net::HTTPOK)
        File.open(archive, "wb") { |file| response.read_body { |chunk| file.write(chunk) } }
      end
    end
    abort "Unable to extract RPI #{number}" unless system("unzip", "-q", "-o", archive, "-d", directory)
    xml = Dir.glob(File.join(directory, "*.xml")).find { |path| File.basename(path).casecmp?("RM#{number}.xml") }
    abort "RPI #{number} XML missing from archive" unless xml
    File.read(xml, encoding: "UTF-8")
  end
end

if $PROGRAM_NAME == __FILE__
  options = {
    latest: 1, numbers: [], files: [], output: nil,
    processes: ENV.fetch("INPI_PROCESSES", ""), pattern: ENV.fetch("INPI_WATCH_PATTERN", ""),
    classes: ENV.fetch("INPI_WATCH_CLASSES", "")
  }
  OptionParser.new do |parser|
    parser.banner = "Usage: check-inpi-rpi.rb [--rpi N]... [--latest N] [--file RM.xml]... [--output DIR] " \
                    "[--processes LIST] [--pattern REGEX] [--classes LIST]"
    parser.on("--rpi N", Integer, "Check a specific RPI number") { |value| options[:numbers] << value }
    parser.on("--latest N", Integer, "Check the N most recent RPIs (default 1)") { |value| options[:latest] = value }
    parser.on("--file PATH", "Check a local RM XML file") { |value| options[:files] << value }
    parser.on("--output DIR", "Write one Markdown report per RPI with findings") { |value| options[:output] = value }
    parser.on("--processes LIST", "Tracked process numbers, comma-separated (INPI_PROCESSES)") { |value| options[:processes] = value }
    parser.on("--pattern REGEX", "Regex for similar mark names (INPI_WATCH_PATTERN)") { |value| options[:pattern] = value }
    parser.on("--classes LIST", "NCL classes for similar marks, comma-separated (INPI_WATCH_CLASSES)") { |value| options[:classes] = value }
  end.parse!

  processes = options[:processes].split(/[\s,]+/).reject(&:empty?)
  abort "Set --processes or --pattern (or INPI_PROCESSES / INPI_WATCH_PATTERN)" if processes.empty? && options[:pattern].empty?
  pattern = options[:pattern].empty? ? nil : Regexp.new(options[:pattern])
  classes = options[:classes].split(/[\s,]+/).reject(&:empty?)
  issues = options[:files].map { |path| File.read(path, encoding: "UTF-8") }
  numbers = options[:numbers]
  numbers = InpiRpi.latest(options[:latest]) if numbers.empty? && issues.empty?
  numbers.each { |number| Dir.mktmpdir("inpi-rpi-") { |directory| issues << InpiRpi.download(number, directory) } }

  FileUtils.mkdir_p(options[:output]) if options[:output]
  found = false
  issues.each do |xml|
    issue = InpiRpi.parse(xml)
    result = InpiRpi.findings(issue, processes: processes, pattern: pattern, classes: classes)
    summary = "RPI #{issue[:number]} (#{issue[:date]}): #{issue[:processes].size} processes, #{result[:own].size} tracked, #{result[:similar].size} similar"
    puts summary
    next if result[:own].empty? && result[:similar].empty?

    found = true
    text = InpiRpi.report(issue, result)
    next puts(text) unless options[:output]

    File.write(File.join(options[:output], "RPI-#{issue[:number]}.md"), text)
    File.write(File.join(options[:output], "RM#{issue[:number]}.xml"), xml)
  end
  File.write(ENV["GITHUB_OUTPUT"], "findings=#{found}\n", mode: "a") if ENV["GITHUB_OUTPUT"]
end
