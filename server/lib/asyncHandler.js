// Small Express helper that forwards async route failures into the central API
// error middleware instead of duplicating try/catch blocks in every route.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
