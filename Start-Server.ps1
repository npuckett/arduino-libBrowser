# Simple PowerShell HTTP Server for local development
# Run this to serve the Arduino Library Browser locally

param(
    [int]$Port = 8080
)

Add-Type -AssemblyName System.Net.Http

# Simple HTTP server function
function Start-SimpleWebServer {
    param([int]$Port)
    
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()
    
    Write-Host "Arduino Library Browser server started at:" -ForegroundColor Green
    Write-Host "http://localhost:$Port" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host ""
    
    try {
        while ($listener.IsListening) {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            $path = $request.Url.LocalPath.TrimStart('/')
            if ($path -eq '') { $path = 'index.html' }
            
            $filePath = Join-Path (Get-Location) $path
            
            Write-Host "$(Get-Date -Format 'HH:mm:ss') - $($request.HttpMethod) /$path" -ForegroundColor Gray
            
            if (Test-Path $filePath -PathType Leaf) {
                $content = Get-Content $filePath -Raw -Encoding UTF8
                $response.StatusCode = 200
                
                # Set content type based on file extension
                switch ((Get-Item $filePath).Extension.ToLower()) {
                    '.html' { $response.ContentType = 'text/html; charset=utf-8' }
                    '.css'  { $response.ContentType = 'text/css; charset=utf-8' }
                    '.js'   { $response.ContentType = 'application/javascript; charset=utf-8' }
                    '.json' { $response.ContentType = 'application/json; charset=utf-8' }
                    default { $response.ContentType = 'text/plain; charset=utf-8' }
                }
                
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            } else {
                $response.StatusCode = 404
                $errorMessage = "File not found: /$path"
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($errorMessage)
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }
            
            $response.Close()
        }
    }
    catch {
        Write-Host "Server stopped." -ForegroundColor Yellow
    }
    finally {
        $listener.Stop()
    }
}

Start-SimpleWebServer -Port $Port
