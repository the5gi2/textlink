// server.js

const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const flash = require('connect-flash');

// Initialize Express app
const app = express();

// Define port and hostname
const port = process.env.PORT || 8080;
const hostname = '0.0.0.0'; // Bind to all interfaces for broader accessibility

// Middleware to parse JSON and URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Set up session management
app.use(session({
  secret: 'ShittersGonnaShit', // Replace with a strong secret in production
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Initialize flash for flash messages
app.use(flash());

// Serve static files from 'public' and 'uploads' directories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

// Store shared items and users
let sharedItems = [];
const usersFilePath = path.join(__dirname, 'data', 'users.json');

// Ensure data directory and users.json exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)){
    fs.mkdirSync(dataDir);
}

if (!fs.existsSync(usersFilePath)){
    fs.writeFileSync(usersFilePath, JSON.stringify([]));
}

// Load users from JSON file with error handling
const loadUsers = () => {
  try {
    const data = fs.readFileSync(usersFilePath, 'utf-8');
    if (!data) {
      return [];
    }
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading users.json:', error);
    return [];
  }
};

// Save users to JSON file
const saveUsers = (users) => {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
};

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server);

// Handle Socket.io connections
io.on('connection', (socket) => {

  // Send current shared items to the newly connected client
  socket.emit('updateData', sharedItems);

  // Handle client disconnect
  socket.on('disconnect', () => {
    // No action needed on disconnect
  });
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  // Allow guest users to post by removing the redirect
  // If you want to restrict certain actions, apply isAuthenticated selectively
  next();
};

// Configure Multer Storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Ensure this directory exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + uuidv4();
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File type restrictions
const fileFilter = (req, file, cb) => {
  cb(null, true);
};

// Initialize Multer with storage, limits, and file filter
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 50MB limit
  fileFilter: fileFilter
});

// Routes for User Registration and Login

// GET route for registration page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// POST route for handling registration
app.post('/register', async (req, res) => {
  const { username, password, password2 } = req.body;
  let errors = [];

  // Check required fields
  if (!username || !password || !password2) {
    errors.push('Please fill in all fields');
  }

  // Check passwords match
  if (password !== password2) {
    errors.push('Passwords do not match');
  }

  // Check password length
  if (password.length < 6) {
    errors.push('Password should be at least 6 characters');
  }

  if (errors.length > 0) {
    // Redirect back with errors as query parameters
    const errorQuery = errors.map(err => encodeURIComponent(err)).join('&');
    res.redirect(`/register.html?errors=${errorQuery}`);
  } else {
    const users = loadUsers();
    const userExists = users.find(user => user.username === username);

    if (userExists) {
      const error = 'Username is already registered';
      res.redirect(`/register.html?errors=${encodeURIComponent(error)}`);
    } else {
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
          id: uuidv4(),
          username,
          password: hashedPassword,
          isAdmin: false // Default to non-admin
        };
        users.push(newUser);
        saveUsers(users);
        const success = 'You are now registered and can log in';
        res.redirect(`/login.html?success=${encodeURIComponent(success)}`);
      } catch (err) {
        console.error(err);
        const error = 'Something went wrong. Please try again.';
        res.redirect(`/register.html?errors=${encodeURIComponent(error)}`);
      }
    }
  }
});

// GET route for login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// POST route for handling login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  let errors = [];

  if (!username || !password) {
    errors.push('Please fill in all fields');
  }

  if (errors.length > 0) {
    const errorQuery = errors.map(err => encodeURIComponent(err)).join('&');
    res.redirect(`/login.html?errors=${errorQuery}`);
  } else {
    const users = loadUsers();
    const user = users.find(user => user.username === username);

    if (!user) {
      const error = 'That username is not registered';
      res.redirect(`/login.html?errors=${encodeURIComponent(error)}`);
    } else {
      try {
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
          req.session.user = {
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin
          };
          res.redirect('/view.html');
        } else {
          const error = 'Password incorrect';
          res.redirect(`/login.html?errors=${encodeURIComponent(error)}`);
        }
      } catch (err) {
        console.error(err);
        const error = 'Something went wrong. Please try again.';
        res.redirect(`/login.html?errors=${encodeURIComponent(error)}`);
      }
    }
  }
});

// GET route for logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/view.html');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login.html?success=' + encodeURIComponent('You are logged out'));
  });
});

// GET route to retrieve current user data
app.get('/api/currentUser', (req, res) => {
  if (req.session.user) {
    res.json({ 
      isAuthenticated: true,
      username: req.session.user.username,
      userId: req.session.user.id,
      isAdmin: req.session.user.isAdmin || false
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// POST route to share items with file uploads
app.post('/share', isAuthenticated, upload.array('files'), (req, res) => {
  const { text, tags } = req.body;
  const files = req.files;
  const userId = req.session.user ? req.session.user.id : null; // Assign null for guests
  const username = req.session.user ? req.session.user.username : 'Guest';

  if (!text && (!files || files.length === 0)) {
    return res.status(400).json({ message: 'No content to share.' });
  }

  // Handle text/code sharing
  if (text) {
    const newItem = {
      id: uuidv4(),
      type: 'text',
      content: text,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      username: username, // Include username
      userId: userId,
      timestamp: new Date()
    };
    sharedItems.unshift(newItem); // Add to the beginning for latest first
  }

  // Handle file/image sharing
  if (files && files.length > 0) {
    files.forEach(file => {
      let type = 'file';
      if (file.mimetype.startsWith('image/')) {
        type = 'image';
      }

      const newItem = {
        id: uuidv4(),
        type: type,
        content: `/uploads/${file.filename}`,
        filename: file.originalname,
        tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
        username: username, // Include username
        userId: userId,
        timestamp: new Date()
      };
      sharedItems.unshift(newItem); // Add to the beginning for latest first
    });
  }

  // Broadcast the updated data to all connected clients
  io.emit('updateData', sharedItems);

  res.status(200).json({ message: 'Content shared successfully.' });
});

// DELETE route to delete an item
app.delete('/delete/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.session.user ? req.session.user.id : null;
  const itemIndex = sharedItems.findIndex(item => item.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ message: 'Item not found.' });
  }

  const item = sharedItems[itemIndex];

  // Check if the user is the owner of the item or an admin
  if (item.userId !== userId && !(req.session.user && req.session.user.isAdmin)) {
    return res.status(403).json({ message: 'You are not authorized to delete this item.' });
  }

  sharedItems.splice(itemIndex, 1);

  // If the removed item is a file, delete it from the server
  if (item.type === 'image' || item.type === 'file') {
    const filePath = path.join(__dirname, item.content);
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting file:', err);
      }
    });
  }

  // Broadcast the updated data to all connected clients
  io.emit('updateData', sharedItems);

  res.status(200).json({ message: 'Item deleted successfully.' });
});

// GET API endpoint to retrieve shared items
app.get('/api/data', (req, res) => {
  // No expiration filtering since it's removed
  res.json(sharedItems);
});

// Serve the home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the view page
app.get('/view.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

// Start the server
server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
