# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a GitHub Pages static website for the Boise Foothills Fire Prevention community advocacy group. The site opposes a commercial shooting range application in the Boise foothills and provides tools for civic engagement.

## Development Commands

### Local Development
```bash
# No build process - this is a static site
# Use any local web server to preview:
python -m http.server 8000
# or
npx http-server
```

### Netlify Functions Development
```bash
# Install dependencies for serverless functions
npm install

# Test Netlify functions locally
netlify dev
```

### Deployment
- Static site: Commits to main branch auto-deploy to GitHub Pages
- Serverless functions: Deployed via Netlify on push

## Architecture

### Static Site Structure
- **Pure HTML/CSS/JavaScript** - No frameworks or build process
- **Inline styles** - All CSS is embedded in HTML files for simplicity
- **No dependencies** for frontend - Works without npm/node

### Key Components

1. **index.html** - Main landing page with FAQ, timeline, resources
   - Mobile-responsive navigation
   - Image galleries with lightbox
   - Smooth scrolling sections

2. **email-generator.html** - AI-powered email generation tool
   - Multi-step form collecting user input
   - Calls Netlify function to generate emails via Claude API
   - Rate limiting: 50 requests per hour per IP

3. **letter-viewer.html** - Interactive permit analysis
   - Loads annotations from `annotations.json`
   - Clickable highlights with tooltips
   - Image popups for supporting evidence

4. **netlify/functions/generate-email.js** - Serverless API endpoint
   - Uses Anthropic SDK to generate personalized emails
   - Environment variable: `ANTHROPIC_API_KEY`
   - CORS enabled for production domain

### Design Principles
- **Progressive enhancement** - Core content works without JavaScript
- **Mobile-first** - All features work on mobile devices
- **Evidence-based** - Heavy use of citations and documentation
- **Accessibility** - Semantic HTML, ARIA labels where needed

### Adding New Features
- Keep JavaScript vanilla (no frameworks)
- Maintain inline styles pattern
- Test on mobile devices
- Preserve no-cache headers for fresh content
- Follow existing code style and structure