// const http = require('http')

// const jobsDB = require('./models/jobs.js');
// const rolesDB = require('./models/role.js');
// const userDb = require('./models/user.js');
// const { URL } = require('url');

// // http.get('/login', () => {

// // })


// http.createServer(async (req, res) => {
//     const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

//   // Only handle POST /login
//   if (req.method === 'POST' && parsedUrl.pathname === '/login') {
//     try {
//       const { email, password } = await parseBody(req);
//       const user = userDb[email];
//       if (!user) {
//         res.writeHead(400, { 'Content-Type': 'application/json' });
//         return res.end(JSON.stringify({ message: 'Invalid email or password' }));
//       }

//       const isMatch = req.password === user.password;
//       if (!isMatch) {
//         res.writeHead(400, { 'Content-Type': 'application/json' });
//         return res.end(JSON.stringify({ message: 'Invalid email or password' }));
//       }
//       const token = { userId: user.id, roleId: user.roleId };

//       res.writeHead(200, { 'Content-Type': 'application/json' });
//       res.end(JSON.stringify({ token, user: { email: user.email, roleId: user.roleId } }));
//     } catch (err) {
//       res.writeHead(500, { 'Content-Type': 'application/json' });
//       res.end(JSON.stringify({ message: 'Server error', error: err.message }));
//     }
//   } else {
//     // 404 Not Found
//     res.writeHead(404, { 'Content-Type': 'application/json' });
//     res.end(JSON.stringify({ message: 'Route not found' }));
//   }
//     // res.writeHead(200, {"content-type": "application/text"});
//     // res.end('Hello');
// }).listen(3000, () => {
//     console.log('Running')
// })






const http = require('http');
const url = require('url');
const querystring = require('querystring');

// In-memory data storage
const users = new Map(); // email -> user object
const jobs = new Map(); // jobId -> job object
const applications = new Map(); // applicationId -> application object
const sessions = new Map(); // sessionId -> user email

let jobIdCounter = 1;
let applicationIdCounter = 1;

// Utility functions
function generateSessionId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function parseRequestBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                resolve({});
            }
        });
    });
}

function sendResponse(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json'
    });
    res.end(JSON.stringify(data));
}

function authenticateUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const sessionId = authHeader.substring(7);
    const userEmail = sessions.get(sessionId);
    return userEmail ? users.get(userEmail) : null;
}

// Email simulation function
function sendEmailNotification(candidateEmail, recruiterEmail, jobTitle) {
    console.log(`
    === EMAIL NOTIFICATION ===
    To Candidate (${candidateEmail}): You have successfully applied for "${jobTitle}"
    To Recruiter (${recruiterEmail}): A new application has been received for "${jobTitle}"
    ==========================
    `);
}

// Route handlers
async function handleCandidateSignup(req, res) {
    const body = await parseRequestBody(req);
    const { email, password } = body;

    if (!email || !password) {
        return sendResponse(res, 400, { error: 'Email and password are required' });
    }

    if (users.has(email)) {
        return sendResponse(res, 400, { error: 'User already exists' });
    }

    users.set(email, {
        email,
        password,
        type: 'candidate',
        createdAt: new Date()
    });

    sendResponse(res, 201, { message: 'Candidate registered successfully' });
}

async function handleRecruiterSignup(req, res) {
    const body = await parseRequestBody(req);
    const { email, password } = body;

    if (!email || !password) {
        return sendResponse(res, 400, { error: 'Email and password are required' });
    }

    if (users.has(email)) {
        return sendResponse(res, 400, { error: 'User already exists' });
    }

    users.set(email, {
        email,
        password, // In production, hash this!
        type: 'recruiter',
        createdAt: new Date()
    });

    sendResponse(res, 201, { message: 'Recruiter registered successfully' });
}

async function handleLogin(req, res) {
    const body = await parseRequestBody(req);
    const { email, password } = body;

    if (!email || !password) {
        return sendResponse(res, 400, { error: 'Email and password are required' });
    }

    const user = users.get(email);
    if (!user || user.password !== password) {
        return sendResponse(res, 401, { error: 'Invalid credentials' });
    }

    const sessionId = generateSessionId();
    sessions.set(sessionId, email);

    sendResponse(res, 200, {
        message: 'Login successful',
        sessionId,
        userType: user.type,
        email: user.email
    });
}

function handleLogout(req, res) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const sessionId = authHeader.substring(7);
        sessions.delete(sessionId);
    }
    sendResponse(res, 200, { message: 'Logout successful' });
}

function handleGetJobs(req, res) {
    const user = authenticateUser(req);
    if (!user) {
        return sendResponse(res, 401, { error: 'Authentication required' });
    }

    const jobList = Array.from(jobs.values()).map(job => ({
        id: job.id,
        title: job.title,
        description: job.description,
        recruiterEmail: job.recruiterEmail,
        createdAt: job.createdAt
    }));

    sendResponse(res, 200, { jobs: jobList });
}

async function handlePostJob(req, res) {
    const user = authenticateUser(req);
    if (!user || user.userType !== 'recruiter') {
        return sendResponse(res, 401, { error: 'Recruiter authentication required' });
    }

    const body = await parseRequestBody(req);
    const { title, description } = body;

    if (!title || !description) {
        return sendResponse(res, 400, { error: 'Job title and description are required' });
    }

    const jobId = jobIdCounter++;
    const job = {
        id: jobId,
        title,
        description,
        recruiterEmail: user.email,
        createdAt: new Date()
    };

    jobs.set(jobId, job);
    sendResponse(res, 201, { message: 'Job posted successfully', job });
}

async function handleApplyJob(req, res) {
    const user = authenticateUser(req);
    if (!user || user.type !== 'candidate') {
        return sendResponse(res, 401, { error: 'Candidate authentication required' });
    }

    const body = await parseRequestBody(req);
    const { jobId } = body;
    console.log('Here');

    if (!jobId) {
        return sendResponse(res, 400, { error: 'Job ID is required' });
    }

    const job = jobs.get(parseInt(jobId));
    if (!job) {
        return sendResponse(res, 404, { error: 'Job not found' });
    }

    // Check if already applied
    const existingApplication = Array.from(applications.values())
        .find(app => app.candidateEmail === user.email && app.jobId === parseInt(jobId));
    
    if (existingApplication) {
        return sendResponse(res, 400, { error: 'Already applied to this job' });
    }

    const applicationId = applicationIdCounter++;
    const application = {
        id: applicationId,
        jobId: parseInt(jobId),
        candidateEmail: user.email,
        jobTitle: job.title,
        recruiterEmail: job.recruiterEmail,
        appliedAt: new Date()
    };

    applications.set(applicationId, application);

    // Send email notifications
    sendEmailNotification(user.email, job.recruiterEmail, job.title);

    sendResponse(res, 201, {
        message: 'Application submitted successfully',
        application: {
            id: applicationId,
            jobTitle: job.title,
            appliedAt: application.appliedAt
        }
    });
}

function handleGetMyApplications(req, res) {
    const user = authenticateUser(req);
    if (!user || user.type !== 'candidate') {
        return sendResponse(res, 401, { error: 'Candidate authentication required' });
    }

    const myApplications = Array.from(applications.values())
        .filter(app => app.candidateEmail === '')
        .map(app => ({
            id: app.id,
            jobId: app.jobId,
            jobTitle: app.jobTitle,
            appliedAt: app.appliedAt
        }));

    sendResponse(res, 200, { applications: myApplications });
}

function handleGetJobApplications(req, res) {
    const user = authenticateUser(req);
    if (!user || user.userType !== 'recruiter') {
        return sendResponse(res, 401, { error: 'Recruiter authentication required' });
    }

    // Get all jobs posted by this recruiter
    const recruiterJobs = Array.from(jobs.values())
        .filter(job => job.recruiterEmail === user.email);

    // Get all applications for these jobs
    const jobApplications = Array.from(applications.values())
        .filter(app => app.recruiterEmail === user.email)
        .map(app => ({
            id: app.id,
            jobId: app.jobId,
            jobTitle: app.jobTitle,
            candidateEmail: app.candidateEmail,
            appliedAt: app.appliedAt
        }));

    sendResponse(res, 200, {
        jobs: recruiterJobs.length,
        applications: jobApplications
    });
}

// Main server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const method = req.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end();
    }

    try {
        // Authentication routes
        if (path === '/api/candidate/signup' && method === 'POST') {
            return handleCandidateSignup(req, res);
        }
        if (path === '/api/recruiter/signup' && method === 'POST') {
            return handleRecruiterSignup(req, res);
        }
        if (path === '/api/login' && method === 'POST') {
            return handleLogin(req, res);
        }
        if (path === '/api/logout' && method === 'POST') {
            return handleLogout(req, res);
        }

        // Job routes
        if (path === '/api/jobs' && method === 'GET') {
            return handleGetJobs(req, res);
        }
        if (path === '/api/jobs' && method === 'POST') {
            return handlePostJob(req, res);
        }

        // Application routes
        if (path === '/api/jobs/apply' && method === 'POST') {
            return handleApplyJob(req, res);
        }
        if (path === '/api/applications/my' && method === 'GET') {
            return handleGetMyApplications(req, res);
        }
        if (path === '/api/applications/received' && method === 'GET') {
            return handleGetJobApplications(req, res);
        }

        // API documentation
        if (path === '/api' && method === 'GET') {
            return sendResponse(res, 200, {
                message: 'Job Website API',
                endpoints: {
                    'POST /api/candidate/signup': 'Register as candidate',
                    'POST /api/recruiter/signup': 'Register as recruiter',
                    'POST /api/login': 'Login (candidate or recruiter)',
                    'POST /api/logout': 'Logout',
                    'GET /api/jobs': 'Get all jobs (authenticated)',
                    'POST /api/jobs': 'Post a job (recruiter only)',
                    'POST /api/jobs/apply': 'Apply to a job (candidate only)',
                    'GET /api/applications/my': 'Get my applications (candidate only)',
                    'GET /api/applications/received': 'Get received applications (recruiter only)'
                }
            });
        }

        // 404 for unknown routes
        sendResponse(res, 404, { error: 'Route not found' });

    } catch (error) {
        console.error('Server error:', error);
        sendResponse(res, 500, { error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Job Website API running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT}/api for API documentation`);
    console.log('\n=== API Usage Examples ===');
    console.log('1. Register candidate: POST /api/candidate/signup');
    console.log('   Body: {"email": "candidate@example.com", "password": "password123"}');
    console.log('\n2. Register recruiter: POST /api/recruiter/signup');
    console.log('   Body: {"email": "recruiter@example.com", "password": "password123"}');
    console.log('\n3. Login: POST /api/login');
    console.log('   Body: {"email": "user@example.com", "password": "password123"}');
    console.log('\n4. Use the sessionId from login as Bearer token in Authorization header');
    console.log('   Header: "Authorization: Bearer <sessionId>"');
});

module.exports = server;