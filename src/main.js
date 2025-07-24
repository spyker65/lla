const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());

// Connect to the SQLite database (creates file if doesn't exist)
const db = new sqlite3.Database('./vocab.db', (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Create the words table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    translation TEXT NOT NULL
  )
`, (err) => {
  if (err) {
    console.error('Failed to create table', err);
  } else {
    // Optional: Insert some default words if table is empty
    db.get('SELECT COUNT(*) as count FROM words', (err, row) => {
      if (row.count === 0) {
        const defaultWords = [
          { word: 'Hello', translation: 'Hola' },
          { word: 'Goodbye', translation: 'Adiós' },
          { word: 'Please', translation: 'Por favor' },
          { word: 'Thank you', translation: 'Gracias' },
          { word: 'Yes', translation: 'Sí' },
          { word: 'No', translation: 'No' }
        ];
        const stmt = db.prepare("INSERT INTO words (word, translation) VALUES (?, ?)");
        defaultWords.forEach(w => {
          stmt.run(w.word, w.translation);
        });
        stmt.finalize();
      }
    });
  }
});

// Route: Get all vocabulary words
app.get('/words', (req, res) => {
  db.all('SELECT * FROM words', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Route: Get a quiz question (random word)
app.get('/quiz', (req, res) => {
  db.get('SELECT * FROM words ORDER BY RANDOM() LIMIT 1', [], (err, word) => {
    if (err || !word) {
      res.status(500).json({ error: 'No words available' });
    } else {
      // Generate options including the correct translation
      generateOptions(word.translation, (options) => {
        res.json({
          question: `What is the translation of "${word.word}"?`,
          options: options,
          answer: word.translation
        });
      });
    }
  });
});

// Helper: Generate multiple-choice options
function generateOptions(correctTranslation, callback) {
  // Fetch 3 random translations that are not the correct one
  db.all(
    'SELECT translation FROM words WHERE translation != ? ORDER BY RANDOM() LIMIT 3',
    [correctTranslation],
    (err, rows) => {
      if (err) {
        callback([]);
        return;
      }
      const optionsSet = new Set();
      optionsSet.add(correctTranslation);
      rows.forEach(row => optionsSet.add(row.translation));
      const optionsArray = Array.from(optionsSet);
      // Shuffle options
      for (let i = optionsArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsArray[i], optionsArray[j]] = [optionsArray[j], optionsArray[i]];
      }
      callback(optionsArray);
    }
  );
}

// Route: Submit answer
app.post('/answer', (req, res) => {
  const { selected, correct } = req.body;
  if (selected === correct) {
    res.json({ correct: true, message: 'Correct!' });
  } else {
    res.json({ correct: false, message: `Incorrect. The correct answer was "${correct}".` });
  }
});

// Route: Add new word
app.post('/add-word', (req, res) => {
  const { word, translation } = req.body;
  if (!word || !translation) {
    return res.status(400).json({ error: 'Word and translation are required.' });
  }
  db.run(
    'INSERT INTO words (word, translation) VALUES (?, ?)',
    [word, translation],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: 'Word added!', id: this.lastID, word, translation });
      }
    }
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
