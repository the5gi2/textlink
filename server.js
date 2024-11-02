// server.js

const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

// Initialize Express app
const app = express();

// Define port and hostname (Render will override these)
const port = process.env.PORT || 8080;
const hostname = '0.0.0.0'; // Bind to all interfaces

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Store shared code and language
let sharedData = {
  text: '',
  language: '' // Leave empty for autodetection
};

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server);

// Handle Socket.io connections
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Send current shared data to the newly connected client
  socket.emit('updateData', sharedData);

  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// POST route to share code
app.post('/share', (req, res) => {
  const { text, language } = req.body;

  if (typeof text !== 'string') {
    return res.status(400).json({ message: 'Invalid data format. "text" is required.' });
  }

  // If language is provided, use it; otherwise, leave it empty for autodetection
  sharedData = { text, language: language || '' };

  // Broadcast the updated data to all connected clients
  io.emit('updateData', sharedData);

  res.status(200).json({ message: 'Code shared successfully.' });
});

// GET API endpoint to retrieve shared data
app.get('/api/data', (req, res) => {
  res.json(sharedData);
});

// Serve the home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the view page
app.get('/view', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

// Start the server
server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
