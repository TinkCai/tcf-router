const route = async (sr) => {
  sr.get('/test', async (req, res) => {
    return res.text('123');
  });
};

module.exports = route;
