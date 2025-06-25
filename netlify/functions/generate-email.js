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

    // Check for test mode
    if (data.test === 'all') {
      // Return mock response immediately without calling LLM
      const mockResponses = [
        {
          subject: 'Urgent Action Needed: Illegal Shooting Range Threatening Our Community',
          email: `Dear Representative Letson and Commissioners,

My home in Eagle sits just 2 miles from the unpermitted shooting range at 15401 N. Cartwright Road, and the constant gunfire has made our once-peaceful neighborhood feel like a war zone. Yesterday afternoon, while my children were playing in our backyard, rapid-fire shooting erupted and continued for over an hour. They were terrified.

What's most concerning is that this facility has been operating without permits for years, blatantly disregarding county regulations designed to protect residents like us. During the current extreme fire conditions, I'm losing sleep knowing that one stray bullet or spark could ignite a wildfire that would devastate our entire community.

I urge you to take immediate enforcement action to shut down this illegal operation before tragedy strikes. Our families deserve to feel safe in our own homes and yards. Please prioritize our safety over the profits of someone who has shown complete disregard for the law and their neighbors' wellbeing.

Thank you for your attention to this urgent matter.

Sincerely,
Test User`
        },
        {
          subject: 'Hidden Springs Resident Demanding Action on Dangerous Gun Range',
          email: `Dear Representative Letson and Commissioners,

The shooting echoes through our Hidden Springs neighborhood at all hours, disrupting our peaceful community and putting lives at risk. As someone who moved here specifically for the quiet mountain lifestyle, I'm appalled that an illegal commercial gun range has been allowed to operate unchecked at 15401 N. Cartwright Road.

I've documented over 50 instances of shooting in just the past month, often lasting hours. The noise carries for miles through our canyon, and with the current drought conditions, I fear it's only a matter of time before a spark ignites a catastrophic wildfire. This unpermitted facility poses an immediate threat to thousands of homes and families.

Please enforce the county ordinances that are being violated daily. This isn't about being anti-gun - it's about illegal commercial activity that endangers our community. We need action now, not after a preventable tragedy occurs.

I look forward to your prompt response and enforcement action.

Respectfully,
Test User`
        },
        {
          subject: 'Boise Foothills at Risk: Shut Down Illegal Shooting Range Now',
          email: `Dear Representative Letson and Commissioners,

I just learned about the illegal shooting range operating at 15401 N. Cartwright Road and I'm alarmed that this has been allowed to continue for so long. Here in the 83714 area, we can hear the gunfire clearly, especially on weekends when it seems to go on for hours without pause.

As a frequent hiker on the Ridge to Rivers trails, I'm deeply concerned about stray bullets and the extreme fire risk this poses. The facility is operating without any permits or safety oversight, in direct violation of county zoning laws. How many more red flag fire warnings do we need before taking action?

This isn't a minor code violation - it's a clear and present danger to our community. I'm asking you to immediately enforce the existing regulations and shut down this illegal operation. Our beautiful foothills and the safety of residents must come first.

Thank you for treating this with the urgency it deserves.

Sincerely,
Test User`
        }
      ];

      // Select a random mock response
      const mockResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          email: mockResponse.email,
          subject: mockResponse.subject,
        }),
      };
    }

    // 2. LENGTH CHECK - Prevent huge prompts
    if (data.prompt.length > 15000) {
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
      model: 'claude-3-5-sonnet-20241022',
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
- DO NOT add any commentary, notes, or explanations after the email body
- Your response should contain ONLY the subject line and email body in the format shown
- Sign the email with the writer's name provided in the prompt (look for "Name:" in the writer details)

IMPORTANT: Generate unique content that doesn't follow a template pattern. 
Vary the opening, structure, and phrasing. Avoid starting with "I am writing to..." 
or other common form letter phrases. Make it sound like a real person wrote it.

Always incorporate the writer's city and/or zip code naturally in the email, but AVOID obvious patterns like:
- DO NOT start with "As a resident of [city]..." or "As a [city] resident..."
- DO NOT use "As someone who lives in..."

Instead, weave location more creatively:
- "My home in Eagle sits just 2 miles from..."
- "Here in the 83702 area, we can hear..."
- "I've lived in Boise for 15 years and..."
- "The shooting echoes through our Hidden Springs neighborhood..."
- Mention location mid-paragraph or in context of a specific concern
Vary how this is incorporated to avoid templates.

Opening examples:
- "I just learned about the illegal shooting range and I'm alarmed..."
- "As someone who [bikes/lives/hikes] in Hidden Springs..."
- "The ongoing violations at 15401 N. Cartwright concern me because..."
- "My family and I were shocked to discover..."
- "Yesterday I realized I have been hearing gunshots, not noise from construction..."`,
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