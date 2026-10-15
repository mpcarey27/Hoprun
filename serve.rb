require 'webrick'

root = File.expand_path('dist', __dir__)
port = 5173

mime_types = WEBrick::HTTPUtils::DefaultMimeTypes
mime_types['js'] = 'application/javascript'
mime_types['mjs'] = 'application/javascript'
mime_types['css'] = 'text/css'
mime_types['svg'] = 'image/svg+xml'

server = WEBrick::HTTPServer.new(
  Port: port,
  DocumentRoot: root,
  MimeTypes: mime_types,
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::INFO),
  AccessLog: []
)

# SPA fallback handler
server.mount_proc '/' do |req, res|
  path = File.join(root, WEBrick::HTTPUtils.unescape(req.path))
  if File.file?(path)
    res.body = File.binread(path)
    ext = File.extname(path).delete('.')
    res['Content-Type'] = mime_types[ext] || 'application/octet-stream'
  else
    index_file = File.join(root, 'index.html')
    res.body = File.binread(index_file)
    res['Content-Type'] = 'text/html'
  end
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

puts "SERVER_RUNNING: http://localhost:#{port}"
$stdout.flush

server.start
