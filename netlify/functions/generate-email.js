const Anthropic = require('@anthropic-ai/sdk');

// Rate limiting store
const requestLog = new Map();

exports.handler = async (event, context) => {
  // Set CORS headers - restrict to your GitHub Pages domain
  const allowedOrigins = [
    'https://foothillsfireprevention.github.io',
    'http://localhost:8888', // For local testing with Netlify Dev
    'http://localhost:8000', // For local testing with Python server
    'http://127.0.0.1:8000'  // Alternative local address
  ];
  
  const origin = event.headers.origin || event.headers.Origin;
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    const data = JSON.parse(event.body);
    
    // 1. VALIDATION - Check prompt structure
    if (!data.prompt || typeof data.prompt !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid request' }),
      };
    }

    // 2. LENGTH CHECK - Prevent huge prompts
    if (data.prompt.length > 5000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request too large' }),
      };
    }

    // 3. CONTENT CHECK - Basic bot detection
    const prompt = data.prompt.toLowerCase();
    const suspiciousPatterns = [
      'ignore previous', 'disregard above', 'system:', 'assistant:',
      'forget everything', 'new instructions'
    ];
    
    if (suspiciousPatterns.some(pattern => prompt.includes(pattern))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid content' }),
      };
    }

    // 4. RATE LIMITING - Simple IP-based
    const clientIP = event.headers['x-forwarded-for']?.split(',')[0] || 
                     event.headers['client-ip'] || 
                     'unknown';
    
    const now = Date.now();
    const userLog = requestLog.get(clientIP) || [];
    
    // Clean old entries (older than 1 hour)
    const recentRequests = userLog.filter(time => now - time < 3600000);
    
    // Check rate limit (5 requests per hour)
    if (recentRequests.length >= 5) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          error: 'Too many requests. Please try again later.' 
        }),
      };
    }
    
    // Log this request
    recentRequests.push(now);
    requestLog.set(clientIP, recentRequests);
    
    // Clean up old IPs to prevent memory leak
    if (requestLog.size > 1000) {
      const oldest = Array.from(requestLog.entries())
        .sort((a, b) => Math.max(...a[1]) - Math.max(...b[1]))
        .slice(0, 500);
      requestLog.clear();
      oldest.forEach(([ip, times]) => requestLog.set(ip, times));
    }

    // 5. API KEY CHECK
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('API key not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Service temporarily unavailable' }),
      };
    }

    // Initialize Anthropic
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    // Adjust token limit based on requested length
    const lengthStyle = data.prompt.includes('1-2 paragraphs') ? 'quick' :
                       data.prompt.includes('4-5 paragraphs') ? 'thorough' : 'standard';
    const maxTokens = lengthStyle === 'quick' ? 300 : 
                      lengthStyle === 'thorough' ? 700 : 500;

    // Generate email with Claude
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: maxTokens,
      temperature: 0.78,
      system: `You are helping concerned citizens write concise, professional emails to local government officials. 

You MUST format your response EXACTLY like this:

SUBJECT: [Write a specific, compelling subject line that reflects the writer's main concern]

BODY:
[Write the email body here - keep it brief, 3-4 paragraphs maximum]

Important:
- The subject line should be unique and specific to the writer's situation
- Vary subject lines based on their primary concerns and tone
- Keep emails concise and personal

IMPORTANT: Generate unique content that doesn't follow a template pattern. 
Vary the opening, structure, and phrasing. Avoid starting with "I am writing to..." 
or other common form letter phrases. Make it sound like a real person wrote it.

Opening examples:
- "I just learned about the illegal shooting range and I'm alarmed..."
- "As someone who [bikes/lives/hikes] in Hidden Springs..."
- "The ongoing violations at 15401 N. Cartwright concern me because..."
- "My family and I were shocked to discover..."
- "Yesterday I drove past the shooting range and realized..."`,
      messages: [
        {
          role: 'user',
          content: data.prompt
        }
      ]
    });

    // Parse the response to extract subject and body
    const responseText = message.content[0].text;
    const match = responseText.match(/SUBJECT:\s*(.+)\n\nBODY:\s*\n(.+)/s);
    
    if (!match) {
      // Fallback if parsing fails
      console.error('Failed to parse AI response format');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          email: responseText,
          subject: 'Concern Regarding Non-compliant Shooting Range at 15401 N. Cartwright Rd',
        }),
      };
    }
    
    const generatedSubject = match[1].trim();
    const generatedEmail = match[2].trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        email: generatedEmail,
        subject: generatedSubject,
      }),
    };

  } catch (error) {
    console.error('Error:', error);
    
    // Don't expose internal errors to client
    const errorMessage = error.message?.includes('rate') 
      ? 'API rate limit exceeded. Please try again later.'
      : 'Failed to generate email. Please try again.';
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: errorMessage
      }),
    };
  }
};