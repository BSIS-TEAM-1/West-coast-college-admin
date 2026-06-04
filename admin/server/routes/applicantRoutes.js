const express = require('express');
const rateLimit = require('express-rate-limit');
const ApplicantController = require('../controllers/applicantController');
const { requireAnyRole } = require('../authorization');
const { cacheMiddleware } = require('../services/apiCache');

const router = express.Router();

const publicApplicantLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Too many application requests from this IP, please try again later.'
});

router.get('/courses', cacheMiddleware({ ttlMs: 10 * 60 * 1000 }), ApplicantController.getCourses);
router.post('/apply', publicApplicantLimiter, ApplicantController.submitApplicant);

function registerProtectedApplicantRoutes(app, authMiddleware) {
  app.get('/api/registrar/applicants', authMiddleware, requireAnyRole('admin', 'registrar'), cacheMiddleware({ ttlMs: 15 * 1000 }), ApplicantController.getApplicants);
  app.get('/api/registrar/applicants/:id', authMiddleware, requireAnyRole('admin', 'registrar'), cacheMiddleware({ ttlMs: 15 * 1000 }), ApplicantController.getApplicantById);
  app.patch('/api/registrar/applicants/:id/status', authMiddleware, requireAnyRole('admin', 'registrar'), ApplicantController.updateApplicantStatus);
}

module.exports = router;
module.exports.registerProtectedApplicantRoutes = registerProtectedApplicantRoutes;
