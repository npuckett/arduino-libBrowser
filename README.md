# The Arduino Library Browser

A comprehensive, searchable catalog of 8,000+ Arduino libraries from GitHub, updated automatically and presented through an intuitive web interface.

**🔗 Live Site:** [The Arduino Library](https://npuckett.github.io/arduino-libBrowser/)

---

## What is this site?

The Arduino Library Browser is a curated database that makes it easy to discover, explore, and evaluate Arduino libraries. Instead of manually searching through thousands of repositories, you can quickly find the perfect library for your project using our powerful search and filtering tools.

### Key Features

- **Comprehensive Database**: 8,000+ Arduino libraries from GitHub
- **Smart Search**: Find libraries by name, description, author, or functionality
- **Advanced Filtering**: Filter by platform (ESP32, AVR, etc.) and subject category
- **Multiple Sorting Options**: Sort by popularity, recency, author, dependencies, and more
- **Detailed Library Information**: View complete metadata, dependencies, and GitHub stats
- **Real-time Updates**: Database refreshed daily with new and updated libraries
- **Responsive Design**: Works seamlessly on desktop and mobile devices

### How do I use it?

#### 🔍 **Searching**
- Use the search box to find libraries by keyword, functionality, or author name
- Search looks through library names, descriptions, and metadata
- Example: Search "temperature sensor" to find temperature-related libraries

#### 🏷️ **Filtering**
- **By Subject**: Click categories like "Sensors", "Communication", "Display" to narrow results
- **By Platform**: Filter by Arduino architecture (ESP32, ESP8266, AVR, SAMD, etc.)
- **Combine Filters**: Use multiple filters together for precise results

#### 📊 **Sorting**
- **Most Recent**: See recently updated libraries (active development)
- **Alphabetical**: Browse libraries A-Z or Z-A
- **Popular Authors**: Find libraries by prolific developers
- **Heavily Relied**: Libraries with many dependencies (widely used)
- **Quick Reads**: Libraries with concise documentation

#### 🎯 **Quick Navigation**
- **Alphabet Buttons**: Jump directly to libraries starting with specific letters
- **Random Selection**: Discover new libraries with the "Grab Bag" feature
- **Library Details**: Click any library card for complete information and GitHub stats

#### 📱 **Getting Library Information**
Each library card shows:
- **Name & Version**: Current library version
- **Author**: Library developer
- **Description**: What the library does
- **Last Updated**: How recently the library was modified
- **Category**: Subject classification

Click a library for detailed information including:
- GitHub repository link
- Star and fork counts
- Supported architectures
- Dependencies
- Related libraries

---

## How does it work?

### Architecture Overview

The Arduino Library Browser is a fully automated system that discovers, processes, and presents Arduino library data through a static web application with automated data pipeline.

### Data Collection & Processing

#### 🔄 **Automated Discovery**
- **Daily Incremental Updates**: Scans GitHub every day for new and updated Arduino libraries
- **Weekly Full Enhancement**: Complete refresh of all library metadata and GitHub statistics
- **Smart Search Queries**: Uses multiple GitHub API strategies to ensure comprehensive coverage
- **Rate Limiting**: Respects GitHub API limits with intelligent retry logic

#### 📊 **Data Enhancement**
- **Library Properties Parsing**: Extracts metadata from `library.properties` files
- **GitHub Integration**: Enriches data with stars, forks, and activity metrics
- **Validation & Cleanup**: Ensures data quality and consistency
- **Incremental Updates**: Only processes changed libraries for efficiency

#### 🗃️ **Database Structure**
The system maintains a JSON database containing:
```json
{
  "enhanced_at": "2025-07-30T13:16:00Z",
  "total_libraries": 8027,
  "libraries": [
    {
      "name": "Library Name",
      "version": "1.2.3",
      "author": "Developer Name",
      "sentence": "Brief description",
      "paragraph": "Detailed description",
      "category": "Sensors",
      "architectures": "esp32,esp8266,avr",
      "repository_url": "https://github.com/user/repo",
      "github_stars": 42,
      "github_forks": 7,
      "github_updated_at": "2025-07-29T10:30:00Z",
      "processed_at": "2025-07-30T13:16:15Z"
    }
  ]
}
```

### Technical Implementation

#### 🤖 **GitHub Actions Automation**
- **Daily Workflow**: Runs at 7 AM UTC, processes recent changes (15-30 minutes)
- **Weekly Workflow**: Runs Sundays at 6 AM UTC, full database refresh (4-6 hours)
- **Error Handling**: Robust retry logic and graceful failure recovery
- **Progress Tracking**: Detailed logging and statistics for monitoring

#### 🌐 **Web Interface**
- **Static Site**: Pure HTML/CSS/JavaScript for fast loading and reliability
- **GitHub Pages**: Automatically deployed when data updates
- **Client-side Processing**: All filtering and sorting happens in the browser
- **Responsive Design**: Mobile-first approach with progressive enhancement

#### 🔧 **Core Technologies**
- **PowerShell**: Data processing scripts with GitHub API integration
- **GitHub Actions**: Automated workflows for continuous updates
- **GitHub Pages**: Static site hosting with automatic deployment
- **Vanilla JavaScript**: Lightweight, dependency-free web interface

### Performance & Scalability

#### 📈 **Metrics**
- **Library Coverage**: 8,000+ libraries and growing
- **Update Frequency**: Daily incremental, weekly comprehensive
- **API Efficiency**: ~35,000-40,000 GitHub API calls per month (well within limits)
- **Site Speed**: < 2 second load times, client-side filtering for instant results

#### 🛡️ **Reliability**
- **Automated Backups**: Git history preserves all data versions
- **Graceful Degradation**: Site works even with partial data
- **Error Recovery**: Automatic retry logic for temporary failures
- **Monitoring**: GitHub Actions provide detailed execution logs

### Contributing & Development

#### 🚀 **Getting Started**
1. **Fork** the repository
2. **Local Development**: Open `index.html` in a browser
3. **Data Updates**: Modify workflow files in `.github/workflows/`
4. **Testing**: Run workflows manually to test changes

#### 🔍 **Key Files**
- `index.html` - Main web interface
- `style.css` - Styling and responsive design
- `.github/workflows/update-libraries.yml` - Daily update automation
- `.github/workflows/weekly-full-enhancement.yml` - Weekly refresh automation
- `AUTOMATION_STRATEGY.md` - Detailed technical documentation

#### 📝 **Issues & Feedback**
Found a bug or have a suggestion? Please [open an issue](https://github.com/npuckett/arduino-libBrowser/issues) on GitHub.

---

## License

This project is open source. Individual Arduino libraries maintain their own licenses - check each library's repository for specific terms.