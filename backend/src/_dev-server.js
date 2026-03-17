// Dev server wrapper - skips route enforcement check
process.env.NODE_ENV = 'test';

const { default: app } = await import('./server.js');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Dev server running on port ${PORT}`);
});
