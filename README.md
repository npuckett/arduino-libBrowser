# Arduino Library Browser

A comprehensive tool for browsing, searching, and sorting Arduino libraries from the official registry. This project generates a static JSON database of all Arduino libraries and provides a web interface for easy exploration.

## Project Overview

This project aims to create a user-friendly website that allows developers to:
- Browse all Arduino libraries in the registry
- Search libraries by name, author, category, or description
- Sort libraries by various criteria (popularity, update date, etc.)
- View detailed information about each library
- Find libraries suitable for specific Arduino architectures

## Project Structure

```
arduino-libBrowser/
├── input/
│   └── repositories.txt          # GitHub URLs of all Arduino libraries
├── output/
│   └── libraries.json           # Generated library database (created by script)
├── temp/
│   └── progress.json            # Progress tracking for resume capability
├── Generate-LibraryData.ps1     # Main PowerShell script for data generation
├── Test-LibraryData.ps1         # Test script for validation
├── USAGE.md                     # Detailed usage instructions
└── README.md                    # This file
```

## Quick Start

### Prerequisites
- PowerShell 7.0 or later
- Internet connection
- Windows, macOS, or Linux

### Step 1: Test the Approach
Before processing all 8,247 libraries, test with a small sample:

```powershell
.\Test-LibraryData.ps1
```

### Step 2: Generate the Full Database
Run the main script to process all libraries:

```powershell
.\Generate-LibraryData.ps1
```

The script will:
- Process repositories in parallel batches
- Save progress automatically
- Resume if interrupted
- Generate a comprehensive JSON file

## Features

### Data Generation Script
- **Parallel Processing**: Handles 8,247+ repositories efficiently
- **Resume Capability**: Automatically resumes from interruption point
- **Rate Limiting**: Respects GitHub's rate limits
- **Error Handling**: Skips problematic repositories gracefully
- **Progress Tracking**: Real-time progress updates
- **Comprehensive Data**: Extracts all library.properties fields

### Library Data Includes
- Library name, version, and description
- Author and maintainer information
- Category and architecture compatibility
- Dependencies and includes
- Repository URLs and metadata
- Processing timestamps

## Performance

- **Total Repositories**: 8,247
- **Estimated Runtime**: 2-4 hours
- **Success Rate**: ~70-80% (libraries with valid library.properties)
- **Output Size**: ~10-20 MB JSON file
- **Memory Usage**: Moderate (batch processing)

## Next Steps

After generating the library database:

1. **Web Interface**: Create a responsive web application
2. **Search Features**: Implement full-text search and filtering
3. **Sorting Options**: Add multiple sorting criteria
4. **Library Details**: Create detailed library pages
5. **Statistics**: Add usage statistics and trends
6. **API**: Provide REST API for programmatic access

## Output Format

The generated `libraries.json` contains:

```json
{
  "generated_at": "2025-01-21T10:30:00Z",
  "total_repositories": 8247,
  "successful_libraries": 6234,
  "libraries": [
    {
      "name": "LibraryName",
      "version": "1.2.3",
      "author": "Author Name",
      "maintainer": "Maintainer Name",
      "sentence": "Short description",
      "paragraph": "Detailed description",
      "category": "Communication",
      "url": "https://github.com/user/repo",
      "architectures": "*",
      "repository_url": "https://github.com/user/repo",
      "repository_name": "user/repo",
      "processed_at": "2025-01-21T10:30:15Z",
      "properties": { /* all library.properties fields */ }
    }
  ]
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `Test-LibraryData.ps1`
5. Submit a pull request

## License

This project is open source. Check individual Arduino libraries for their specific licenses.