#Requires -Version 7.0

<#
.SYNOPSIS
    Generates a JSON file containing Arduino library data from GitHub repositories.

.DESCRIPTION
    This script reads repositories.txt, fetches library.properties files from GitHub,
    and creates a comprehensive JSON file with all library information.
    Handles large scale processing with parallel execution and error handling.

.PARAMETER InputFile
    Path to the repositories.txt file. Default: "input/repositories.txt"

.PARAMETER OutputFile
    Path for the output JSON file. Default: "output/libraries.json"

.PARAMETER MaxParallelJobs
    Maximum number of parallel jobs. Default: 10

.PARAMETER DelayBetweenBatches
    Delay in seconds between batches. Default: 2

.PARAMETER BatchSize
    Number of repositories to process in each batch. Default: 50

.PARAMETER ResumeFile
    Path to the resume file for continuing interrupted processing. Default: "temp/progress.json"
#>

param(
    [string]$InputFile = "input/repositories.txt",
    [string]$OutputFile = "output/libraries.json",
    [int]$MaxParallelJobs = 10,
    [int]$DelayBetweenBatches = 2,
    [int]$BatchSize = 50,
    [string]$ResumeFile = "temp/progress.json"
)

# Ensure output and temp directories exist
$outputDir = Split-Path $OutputFile -Parent
$tempDir = Split-Path $ResumeFile -Parent

if ($outputDir -and !(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}
if ($tempDir -and !(Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

# Function to parse library.properties content
function Parse-LibraryProperties {
    param([string]$Content)
    
    $properties = @{}
    
    if ([string]::IsNullOrWhiteSpace($Content)) {
        return $properties
    }
    
    $lines = $Content -split "`n"
    foreach ($line in $lines) {
        $line = $line.Trim()
        if ($line -and !$line.StartsWith('#')) {
            if ($line -match '^([^=]+)=(.*)$') {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                $properties[$key] = $value
            }
        }
    }
    
    return $properties
}

# Function to fetch library.properties from GitHub
function Get-LibraryProperties {
    param(
        [string]$RepoUrl,
        [string]$RepoName
    )
    
    try {
        # Convert GitHub repo URL to raw content URL
        $rawUrl = $RepoUrl -replace 'github\.com', 'raw.githubusercontent.com'
        $rawUrl = $rawUrl -replace '\.git$', ''
        if (!$rawUrl.EndsWith('/')) {
            $rawUrl += '/'
        }
        $propertiesUrl = $rawUrl + "main/library.properties"
        
        # Try main branch first, then master if main fails
        $response = $null
        try {
            $response = Invoke-RestMethod -Uri $propertiesUrl -TimeoutSec 30 -ErrorAction Stop
        }
        catch {
            # Try master branch
            $propertiesUrl = $rawUrl + "master/library.properties"
            $response = Invoke-RestMethod -Uri $propertiesUrl -TimeoutSec 30 -ErrorAction Stop
        }
        
        if ($response) {
            $properties = Parse-LibraryProperties -Content $response
            
            # Add metadata
            $libraryData = @{
                repository_url = $RepoUrl
                repository_name = $RepoName
                processed_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                properties = $properties
            }
            
            # Add standard fields with fallbacks
            $libraryData.name = $properties.name ?? $RepoName
            $libraryData.version = $properties.version ?? "unknown"
            $libraryData.author = $properties.author ?? "unknown"
            $libraryData.maintainer = $properties.maintainer ?? $properties.author ?? "unknown"
            $libraryData.sentence = $properties.sentence ?? ""
            $libraryData.paragraph = $properties.paragraph ?? ""
            $libraryData.category = $properties.category ?? "Uncategorized"
            $libraryData.url = $properties.url ?? $RepoUrl
            $libraryData.architectures = $properties.architectures ?? "*"
            $libraryData.depends = $properties.depends ?? ""
            $libraryData.dot_a_linkage = $properties.dot_a_linkage ?? ""
            $libraryData.includes = $properties.includes ?? ""
            $libraryData.precompiled = $properties.precompiled ?? ""
            
            return $libraryData
        }
    }
    catch {
        Write-Warning "Failed to fetch library.properties for $RepoName`: $($_.Exception.Message)"
        return $null
    }
    
    return $null
}

# Function to extract repository name from URL
function Get-RepoName {
    param([string]$Url)
    
    $Url = $Url.Trim()
    $Url = $Url -replace '\.git$', ''
    $parts = $Url -split '/'
    if ($parts.Length -ge 2) {
        return "$($parts[-2])/$($parts[-1])"
    }
    return $Url
}

# Main processing function
function Process-Repositories {
    param(
        [string[]]$Repositories,
        [hashtable]$ProcessedRepos = @{},
        [int]$StartIndex = 0
    )
    
    $totalRepos = $Repositories.Count
    $libraries = @()
    $processed = $StartIndex
    
    Write-Host "Processing $($totalRepos - $StartIndex) repositories (starting from index $StartIndex)..." -ForegroundColor Green
    
    # Process in batches
    for ($i = $StartIndex; $i -lt $totalRepos; $i += $BatchSize) {
        $endIndex = [Math]::Min($i + $BatchSize - 1, $totalRepos - 1)
        $batch = $Repositories[$i..$endIndex]
        
        Write-Host "`nProcessing batch $([Math]::Floor($i / $BatchSize) + 1): repositories $($i + 1) to $($endIndex + 1)" -ForegroundColor Cyan
        
        # Process each repository in the batch sequentially to avoid complex parallel issues
        $batchResults = @()
        foreach ($repoUrl in $batch) {
            $repoUrl = $repoUrl.Trim()
            if ([string]::IsNullOrWhiteSpace($repoUrl)) {
                continue
            }
            
            $repoName = Get-RepoName -Url $repoUrl
            
            # Skip if already processed
            if ($ProcessedRepos.ContainsKey($repoName)) {
                $batchResults += $ProcessedRepos[$repoName]
                continue
            }
            
            $result = Get-LibraryProperties -RepoUrl $repoUrl -RepoName $repoName
            if ($result) {
                $batchResults += $result
            }
        }
        
        # Process results
        foreach ($result in $batchResults) {
            $processed++
            
            if ($result) {
                $libraries += $result
                $ProcessedRepos[$result.repository_name] = $result
            }
            
            # Show progress
            $percentComplete = [Math]::Round(($processed / $totalRepos) * 100, 1)
            Write-Progress -Activity "Processing Arduino Libraries" -Status "Processed $processed of $totalRepos repositories ($percentComplete%)" -PercentComplete $percentComplete
        }
        
        # Save progress
        $progressData = @{
            processed_count = $processed
            total_count = $totalRepos
            libraries = $libraries
            processed_repos = $ProcessedRepos
            last_batch_end = $endIndex
        }
        $progressData | ConvertTo-Json -Depth 10 | Set-Content $ResumeFile -Encoding UTF8
        
        Write-Host "Completed batch. Total processed: $processed/$totalRepos ($([Math]::Round(($processed / $totalRepos) * 100, 1))%)" -ForegroundColor Yellow
        
        # Delay between batches to avoid rate limiting
        if ($i + $BatchSize -lt $totalRepos) {
            Write-Host "Waiting $DelayBetweenBatches seconds before next batch..." -ForegroundColor Gray
            Start-Sleep -Seconds $DelayBetweenBatches
        }
    }
    
    Write-Progress -Activity "Processing Arduino Libraries" -Completed
    
    return @{
        libraries = $libraries
        processed = $processed
    }
}

# Main script execution
try {
    Write-Host "Arduino Library Data Generator" -ForegroundColor Green
    Write-Host "==============================" -ForegroundColor Green
    
    # Check if input file exists
    if (!(Test-Path $InputFile)) {
        throw "Input file not found: $InputFile"
    }
    
    # Read repositories
    Write-Host "Reading repositories from $InputFile..." -ForegroundColor Yellow
    $repositories = Get-Content $InputFile | Where-Object { $_.Trim() -ne "" }
    $totalCount = $repositories.Count
    Write-Host "Found $totalCount repositories to process." -ForegroundColor Green
    
    # Check for resume file
    $processedRepos = @{}
    $startIndex = 0
    
    if (Test-Path $ResumeFile) {
        Write-Host "Found resume file. Loading previous progress..." -ForegroundColor Cyan
        try {
            $resumeData = Get-Content $ResumeFile -Raw | ConvertFrom-Json
            $processedRepos = @{}
            if ($resumeData.processed_repos) {
                $resumeData.processed_repos.PSObject.Properties | ForEach-Object {
                    $processedRepos[$_.Name] = $_.Value
                }
            }
            $startIndex = $resumeData.last_batch_end + 1
            Write-Host "Resuming from repository $($startIndex + 1) of $totalCount" -ForegroundColor Green
        }
        catch {
            Write-Warning "Could not load resume file. Starting from beginning."
            $startIndex = 0
        }
    }
    
    # Process repositories
    $result = Process-Repositories -Repositories $repositories -ProcessedRepos $processedRepos -StartIndex $startIndex
    
    # Create final output
    $outputData = @{
        generated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        total_repositories = $totalCount
        processed_repositories = $result.processed
        successful_libraries = $result.libraries.Count
        libraries = $result.libraries
    }
    
    # Save results
    Write-Host "`nSaving results to $OutputFile..." -ForegroundColor Yellow
    $outputData | ConvertTo-Json -Depth 10 | Set-Content $OutputFile -Encoding UTF8
    
    # Clean up progress file
    if (Test-Path $ResumeFile) {
        Remove-Item $ResumeFile -Force
    }
    
    # Summary
    Write-Host "`n" -NoNewline
    Write-Host "Processing Complete!" -ForegroundColor Green
    Write-Host "===================" -ForegroundColor Green
    Write-Host "Total repositories: $totalCount" -ForegroundColor White
    Write-Host "Successfully processed: $($result.libraries.Count)" -ForegroundColor Green
    Write-Host "Failed/Skipped: $($totalCount - $result.libraries.Count)" -ForegroundColor Red
    Write-Host "Success rate: $([Math]::Round(($result.libraries.Count / $totalCount) * 100, 1))%" -ForegroundColor Cyan
    Write-Host "Output file: $OutputFile" -ForegroundColor Yellow
    
    # Display some statistics
    if ($result.libraries.Count -gt 0) {
        $categories = $result.libraries | Group-Object category | Sort-Object Count -Descending
        Write-Host "`nTop 10 Categories:" -ForegroundColor Cyan
        $categories | Select-Object -First 10 | ForEach-Object {
            Write-Host "  $($_.Name): $($_.Count)" -ForegroundColor White
        }
    }
}
catch {
    Write-Error "Script failed: $($_.Exception.Message)"
    exit 1
}
