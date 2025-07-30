# Fast Library Enhancement Script
# Optimized for 7-hour completion with balanced rate limiting
# Designed to handle interruptions and automatically resume

param(
    [string]$InputFile = "output/libraries.json",
    [string]$OutputFile = "output/libraries-enhanced.json",
    [int]$BatchSize = 50,  # Larger batches for efficiency
    [int]$DelayBetweenBatches = 60,  # 1 minute between batches
    [int]$DelayBetweenRequests = 1000,  # 1 second between requests
    [string]$ProgressFile = "enhancement-progress.json",
    [string]$LogFile = "enhancement-fast.log",
    [int]$SaveProgressEvery = 10,  # Save progress every 10 libraries
    [int]$MaxRetries = 2  # Reduce retries for speed
)

# --- GITHUB AUTHENTICATION ---
# Set your GitHub token as an environment variable: $env:GITHUB_TOKEN = "your_token_here"
$GitHubToken = $env:GITHUB_TOKEN
if (-not $GitHubToken) {
    Write-Error "GitHub token not found. Please set the GITHUB_TOKEN environment variable."
    exit 1
}
$GitHubHeaders = @{
    'User-Agent' = 'Arduino-Library-Browser-Fast'
    'Accept' = 'application/vnd.github.v3+json'
    'Authorization' = "token $GitHubToken"
}
# --- END AUTHENTICATION ---

# Function to write timestamped log entries
function Write-Log {
    param($message, $color = "White")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $message"
    Write-Host $logEntry -ForegroundColor $color
    try {
        Add-Content -Path $LogFile -Value $logEntry -Encoding UTF8
    } catch {
        # Ignore log file errors to prevent script failure
    }
}

# Function to save progress frequently
function Save-Progress {
    param($index, $libraries, $stats)
    try {
        $progressData = @{
            last_processed_index = $index
            enhanced_libraries = $libraries
            statistics = $stats
            saved_at = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
            script_version = "fast"
        }
        $progressData | ConvertTo-Json -Depth 10 | Set-Content $ProgressFile -Encoding UTF8
        Write-Log "Progress saved (index: $index, total: $($libraries.Count))" "Gray"
    } catch {
        Write-Log "Warning: Failed to save progress: $($_.Exception.Message)" "Yellow"
    }
}

# Function to load previous progress
function Get-Progress {
    if (Test-Path $ProgressFile) {
        try {
            $progressData = Get-Content $ProgressFile | ConvertFrom-Json
            return @{
                success = $true
                lastIndex = $progressData.last_processed_index
                libraries = $progressData.enhanced_libraries
                stats = $progressData.statistics
                savedAt = $progressData.saved_at
            }
        } catch {
            Write-Log "Warning: Could not load progress file, starting fresh" "Yellow"
        }
    }
    return @{ success = $false }
}

# Fast GitHub API function with minimal retry logic
function Get-GitHubRepoInfo {
    param($repositoryName, $retryCount = 0)
    
    $apiUrl = "https://api.github.com/repos/$repositoryName"
    
    try {
        $response = Invoke-RestMethod -Uri $apiUrl -Headers $GitHubHeaders -ErrorAction Stop -TimeoutSec 15
        
        return @{
            success = $true
            created_at = $response.created_at
            updated_at = $response.updated_at
            pushed_at = $response.pushed_at
            stargazers_count = $response.stargazers_count
            forks_count = $response.forks_count
            size = $response.size
            default_branch = $response.default_branch
            language = $response.language
            topics = $response.topics
            description = $response.description
        }
    } catch {
        $errorMsg = $_.Exception.Message
        
        # Handle rate limiting with shorter wait
        if ($errorMsg -like "*403*" -and $errorMsg -like "*rate limit*") {
            if ($retryCount -eq 0) {
                Write-Log "Rate limited. Waiting 2 minutes..." "Magenta"
                Start-Sleep -Seconds 120  # 2 minutes only
                return Get-GitHubRepoInfo -repositoryName $repositoryName -retryCount 1
            }
        }
        # Quick retry for network errors
        elseif ($retryCount -eq 0 -and ($errorMsg -like "*timeout*" -or $errorMsg -like "*network*")) {
            Start-Sleep -Seconds 5
            return Get-GitHubRepoInfo -repositoryName $repositoryName -retryCount 1
        }
        
        return @{
            success = $false
            error = $errorMsg
            retries = $retryCount
        }
    }
}

# Main script execution with error handling
try {
    Write-Host "Fast Arduino Library Enhancement (7-Hour Target)" -ForegroundColor Green
    Write-Host "Optimized timing for faster completion" -ForegroundColor Green
    Write-Host ""
    
    Write-Log "Starting fast enhancement process" "Green"
    Write-Log "Parameters: BatchSize=$BatchSize, DelayBetweenBatches=$DelayBetweenBatches, DelayBetweenRequests=$DelayBetweenRequests" "White"
    
    # Load input data
    if (-not (Test-Path $InputFile)) {
        Write-Log "Error: Input file $InputFile not found!" "Red"
        exit 1
    }
    
    Write-Log "Loading library data from $InputFile..." "Yellow"
    $existingData = Get-Content $InputFile | ConvertFrom-Json
    $allLibraries = $existingData.libraries
    Write-Log "Loaded $($allLibraries.Count) libraries" "Green"
    
    # Check for existing progress
    $startIndex = 0
    $enhancedLibraries = @()
    $stats = @{ success = 0; errors = 0; retries = 0 }
    
    $progress = Get-Progress
    if ($progress.success) {
        $startIndex = $progress.lastIndex + 1
        $enhancedLibraries = $progress.libraries
        $stats = $progress.stats
        Write-Log "Resuming from library #$($startIndex + 1)" "Cyan"
        Write-Log "Previous progress: $($enhancedLibraries.Count) libraries, $($stats.success) successful, $($stats.errors) errors" "White"
    }
    
    # Calculate remaining work
    $totalLibraries = $allLibraries.Count
    $remainingCount = $totalLibraries - $startIndex
    
    if ($remainingCount -le 0) {
        Write-Log "All libraries already processed!" "Green"
        exit 0
    }
    
    # Estimate completion time (optimized for speed)
    $avgSecondsPerLibrary = ($DelayBetweenRequests / 1000) + 0.5  # Faster API calls
    $totalBatches = [Math]::Ceiling($remainingCount / $BatchSize)
    $avgSecondsPerBatch = $DelayBetweenBatches
    $estimatedSeconds = ($remainingCount * $avgSecondsPerLibrary) + ($totalBatches * $avgSecondsPerBatch)
    $estimatedHours = $estimatedSeconds / 3600
    
    Write-Log "Processing plan:" "Cyan"
    Write-Log "  Remaining libraries: $remainingCount" "White"
    Write-Log "  Total batches: $totalBatches" "White"
    Write-Log "  Estimated time: $($estimatedHours.ToString('F1')) hours" "White"
    Write-Log "  Expected completion: $((Get-Date).AddSeconds($estimatedSeconds).ToString('MM-dd HH:mm'))" "Green"
    Write-Log "" "White"
    
    # Process libraries with fast error handling
    for ($i = $startIndex; $i -lt $totalLibraries; $i++) {
        $library = $allLibraries[$i]
        $currentNum = $i + 1
        
        try {
            Write-Host "[$currentNum/$totalLibraries] $($library.repository_name)" -NoNewline
            
            # Get GitHub data with minimal retry
            $repoInfo = Get-GitHubRepoInfo -repositoryName $library.repository_name
            
            # Create enhanced library object
            $enhancedLibrary = $library.PSObject.Copy()
            
            if ($repoInfo.success) {
                # Add all GitHub data
                $enhancedLibrary | Add-Member -NotePropertyName "github_created_at" -NotePropertyValue $repoInfo.created_at
                $enhancedLibrary | Add-Member -NotePropertyName "github_updated_at" -NotePropertyValue $repoInfo.updated_at
                $enhancedLibrary | Add-Member -NotePropertyName "github_pushed_at" -NotePropertyValue $repoInfo.pushed_at
                $enhancedLibrary | Add-Member -NotePropertyName "github_stars" -NotePropertyValue $repoInfo.stargazers_count
                $enhancedLibrary | Add-Member -NotePropertyName "github_forks" -NotePropertyValue $repoInfo.forks_count
                $enhancedLibrary | Add-Member -NotePropertyName "github_size_kb" -NotePropertyValue $repoInfo.size
                $enhancedLibrary | Add-Member -NotePropertyName "github_default_branch" -NotePropertyValue $repoInfo.default_branch
                $enhancedLibrary | Add-Member -NotePropertyName "github_language" -NotePropertyValue $repoInfo.language
                $enhancedLibrary | Add-Member -NotePropertyName "github_topics" -NotePropertyValue ($repoInfo.topics -join ",")
                $enhancedLibrary | Add-Member -NotePropertyName "github_description" -NotePropertyValue $repoInfo.description
                $enhancedLibrary | Add-Member -NotePropertyName "enhanced_at" -NotePropertyValue (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
                
                Write-Host " ✓" -ForegroundColor Green
                $stats.success++
            } else {
                # Add error information
                $enhancedLibrary | Add-Member -NotePropertyName "github_error" -NotePropertyValue $repoInfo.error
                $enhancedLibrary | Add-Member -NotePropertyName "enhanced_at" -NotePropertyValue (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
                
                Write-Host " ✗" -ForegroundColor Red
                $stats.errors++
                
                if ($repoInfo.retries) {
                    $stats.retries += $repoInfo.retries
                }
            }
            
            $enhancedLibraries += $enhancedLibrary
            
            # Save progress periodically
            if (($i + 1) % $SaveProgressEvery -eq 0) {
                Save-Progress -index $i -libraries $enhancedLibraries -stats $stats
            }
            
            # Delay between requests (1 second)
            Start-Sleep -Milliseconds $DelayBetweenRequests
            
            # Batch delay logic (1 minute between batches)
            if (($i + 1 - $startIndex) % $BatchSize -eq 0 -and $i -lt ($totalLibraries - 1)) {
                $nextBatchTime = (Get-Date).AddSeconds($DelayBetweenBatches).ToString("HH:mm:ss")
                Write-Log "Batch complete. Waiting 1 minute (next: $nextBatchTime)" "Yellow"
                Start-Sleep -Seconds $DelayBetweenBatches
            }
            
        } catch {
            Write-Log "Unexpected error processing $($library.repository_name): $($_.Exception.Message)" "Red"
            $stats.errors++
            
            # Add minimal error entry to keep the array synchronized
            $errorLibrary = $library.PSObject.Copy()
            $errorLibrary | Add-Member -NotePropertyName "processing_error" -NotePropertyValue $_.Exception.Message
            $errorLibrary | Add-Member -NotePropertyName "enhanced_at" -NotePropertyValue (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
            $enhancedLibraries += $errorLibrary
        }
    }
    
    # Create final output
    Write-Log "Creating final output file..." "Yellow"
    $enhancedData = @{
        processed_repositories = $existingData.processed_repositories
        enhanced_repositories = $stats.success
        enhancement_errors = $stats.errors
        retry_attempts = $stats.retries
        enhanced_at = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
        original_processed_at = $existingData.processed_at
        processing_stats = @{
            batch_size = $BatchSize
            delay_between_batches_seconds = $DelayBetweenBatches
            delay_between_requests_ms = $DelayBetweenRequests
            save_frequency = $SaveProgressEvery
            max_retries = $MaxRetries
        }
        libraries = $enhancedLibraries
    }
    
    # Save final data
    $enhancedData | ConvertTo-Json -Depth 10 | Set-Content $OutputFile -Encoding UTF8
    Write-Log "Enhanced data saved to $OutputFile" "Green"
    
    # Cleanup
    if (Test-Path $ProgressFile) {
        Remove-Item $ProgressFile
        Write-Log "Cleaned up progress file" "Gray"
    }
    
    # Final summary
    $fileSize = [Math]::Round((Get-Item $OutputFile).Length / 1MB, 2)
    $successRate = [Math]::Round(($stats.success / $totalLibraries) * 100, 1)
    
    Write-Log "" "White"
    Write-Log "🎉 Fast Enhancement Complete!" "Green"
    Write-Log "Total libraries: $totalLibraries" "White"
    Write-Log "Successfully enhanced: $($stats.success)" "Green"
    Write-Log "Errors: $($stats.errors)" "Red"
    Write-Log "Retry attempts: $($stats.retries)" "Yellow"
    Write-Log "Success rate: $successRate%" "White"
    Write-Log "Output file size: $fileSize MB" "Cyan"
    Write-Log "Ready to update your website with real timestamp data!" "Green"
    
} catch {
    Write-Log "Fatal error in main script: $($_.Exception.Message)" "Red"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "Red"
    exit 1
}
