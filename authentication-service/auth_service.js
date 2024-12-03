const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const port = process.env.AUTH_PORT || 8000;

app.use(bodyParser.json());

// This is a mock user database. In a real-world scenario, you'd use a proper database.
const users = {
  user1: "password1",
  user2: "password2",
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.post("/validate", (req, res) => {
  const { userid, password } = req.body;

  if (users[userid] && users[userid] === password) {
    res
      .status(200)
      .json({ message: "Authentication successful", userid: userid });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.listen(port, () => {
  console.log(`Authentication service listening at http://localhost:${port}`);
});