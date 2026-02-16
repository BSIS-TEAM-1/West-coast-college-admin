const { sanitizeInput, inputValidationMiddleware, buildSafeQuery, safeObjectId } = require('./securityMiddleware');
const mongoose = require('mongoose');

// Test sanitizeInput
describe('sanitizeInput', () => {
  test('rejects $ keys', () => {
    expect(() => sanitizeInput({ '$ne': null })).toThrow('Forbidden MongoDB operator detected');
  });

  test('rejects dotted keys', () => {
    expect(() => sanitizeInput({ 'profile.role': 'admin' })).toThrow('Forbidden dot notation key detected');
  });

  test('allows normal keys', () => {
    expect(() => sanitizeInput({ username: 'test', password: 'pass' })).not.toThrow();
  });

  test('deep scans nested objects', () => {
    expect(() => sanitizeInput({ user: { '$or': [] } })).toThrow('Forbidden MongoDB operator detected');
  });

  test('allows arrays', () => {
    expect(() => sanitizeInput({ roles: ['admin', 'user'] })).not.toThrow();
  });
});

// Test buildSafeQuery
describe('buildSafeQuery', () => {
  test('builds safe query with $eq', () => {
    const result = buildSafeQuery({ username: 'test', active: true });
    expect(result).toEqual({ username: { $eq: 'test' }, active: { $eq: true } });
  });

  test('rejects complex objects', () => {
    expect(() => buildSafeQuery({ username: { $ne: null } })).toThrow('Complex objects not allowed');
  });

  test('allows arrays', () => {
    const result = buildSafeQuery({ roles: ['admin'] });
    expect(result).toEqual({ roles: ['admin'] });
  });
});

// Test safeObjectId
describe('safeObjectId', () => {
  test('accepts valid ObjectId', () => {
    const validId = '507f1f77bcf86cd799439011';
    const result = safeObjectId(validId);
    expect(result.toString()).toBe(validId);
  });

  test('rejects invalid ObjectId', () => {
    expect(() => safeObjectId('invalid')).toThrow('Invalid ObjectId format');
  });
});

// Test inputValidationMiddleware with attack payloads
describe('inputValidationMiddleware', () => {
  let mockReq, mockRes, next;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('rejects $ne operator in body', () => {
    mockReq.body = { email: { '$ne': null } };
    const middleware = inputValidationMiddleware();
    middleware(mockReq, mockRes, next);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects $gt operator in query', () => {
    mockReq.query = { password: { '$gt': '' } };
    const middleware = inputValidationMiddleware();
    middleware(mockReq, mockRes, next);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects $or operator in body', () => {
    mockReq.body = { '$or': [{ role: 'admin' }] };
    const middleware = inputValidationMiddleware();
    middleware(mockReq, mockRes, next);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects dotted keys in params', () => {
    mockReq.params = { 'role.isAdmin': true };
    const middleware = inputValidationMiddleware();
    middleware(mockReq, mockRes, next);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows normal input', () => {
    mockReq.body = { username: 'test', password: 'pass123' };
    const middleware = inputValidationMiddleware();
    middleware(mockReq, mockRes, next);
    expect(next).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});

// Test with Joi schemas
describe('inputValidationMiddleware with schemas', () => {
  let mockReq, mockRes, next;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('validates login schema', () => {
    mockReq.body = { username: 'test', password: 'pass123' };
    const middleware = inputValidationMiddleware({
      bodySchema: {
        validate: (data) => {
          if (!data.username || !data.password) {
            return { error: { details: [{ message: 'required' }] } };
          }
          return {};
        }
      }
    });
    middleware(mockReq, mockRes, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects invalid login schema', () => {
    mockReq.body = { username: '', password: 'pass123' };
    const middleware = inputValidationMiddleware({
      bodySchema: {
        validate: (data) => {
          if (!data.username || !data.password) {
            return { error: { details: [{ message: 'required' }] } };
          }
          return {};
        }
      }
    });
    middleware(mockReq, mockRes, next);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
