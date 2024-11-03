// server.js

const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Initialize Express app
const app = express();

// Define port and hostname
const port = process.env.PORT || 8080;
const hostname = '0.0.0.0'; // Bind to all interfaces

// Middleware to parse JSON bodies
app.use(express.json());

// Set up multer for file uploads with size and type restrictions
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + uuidv4();
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File type restrictions
const fileFilter = (req, file, cb) => {

  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  if (extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only images and documents are allowed!'));
  }
};

// Initialize multer with limits
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: fileFilter
});

// Serve static files from 'public' and 'uploads' directories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

// Store shared items
let sharedItems = [];

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server);

// Handle Socket.io connections
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Send current shared items to the newly connected client
  socket.emit('updateData', sharedItems);

  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// POST route to share items
app.post('/share', upload.array('files'), (req, res) => {
  const { text } = req.body;
  const files = req.files;

  if (!text && (!files || files.length === 0)) {
    return res.status(400).json({ message: 'No content to share.' });
  }

  // Handle text/code sharing
  if (text) {
    const newItem = {
      id: uuidv4(),
      type: 'text',
      content: text,
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
  const itemIndex = sharedItems.findIndex(item => item.id === id);
  if (itemIndex === -1) {
    return res.status(404).json({ message: 'Item not found.' });
  }

  const [removedItem] = sharedItems.splice(itemIndex, 1);

  // If the removed item is a file, delete it from the server
  if (removedItem.type === 'image' || removedItem.type === 'file') {
    const filePath = path.join(__dirname, removedItem.content);
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
  res.json(sharedItems);
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
