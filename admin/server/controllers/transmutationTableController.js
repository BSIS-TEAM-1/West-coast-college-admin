const TransmutationTable = require('../models/TransmutationTable');

/**
 * GET /registrar/transmutation-tables
 * List all transmutation tables.
 */
async function listTables(req, res) {
  try {
    const tables = await TransmutationTable.find()
      .sort({ isActive: -1, name: 1 })
      .lean();
    return res.json({ success: true, data: tables });
  } catch (error) {
    console.error('Error listing transmutation tables:', error);
    return res.status(500).json({ error: 'Failed to list transmutation tables.' });
  }
}

/**
 * GET /registrar/transmutation-tables/active
 * Get the currently active table.
 */
async function getActiveTable(req, res) {
  try {
    const table = await TransmutationTable.getActive();
    return res.json({ success: true, data: table });
  } catch (error) {
    console.error('Error getting active transmutation table:', error);
    return res.status(500).json({ error: 'Failed to get active transmutation table.' });
  }
}

/**
 * GET /registrar/transmutation-tables/:id
 * Get a single table by id.
 */
async function getTable(req, res) {
  try {
    const table = await TransmutationTable.findById(req.params.id).lean();
    if (!table) return res.status(404).json({ error: 'Transmutation table not found.' });
    return res.json({ success: true, data: table });
  } catch (error) {
    console.error('Error getting transmutation table:', error);
    return res.status(500).json({ error: 'Failed to get transmutation table.' });
  }
}

/**
 * POST /registrar/transmutation-tables
 * Create a new transmutation table.
 */
async function createTable(req, res) {
  try {
    const { name, description, brackets, isActive } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    if (!Array.isArray(brackets) || brackets.length === 0) {
      return res.status(400).json({ error: 'At least one bracket is required.' });
    }

    // Validate brackets
    for (const b of brackets) {
      if (typeof b.minRaw !== 'number' || typeof b.maxRaw !== 'number' || typeof b.grade !== 'number') {
        return res.status(400).json({ error: 'Each bracket must have minRaw, maxRaw, and grade as numbers.' });
      }
      if (b.minRaw < 0 || b.maxRaw > 100 || b.minRaw > b.maxRaw) {
        return res.status(400).json({ error: `Invalid bracket range: ${b.minRaw}-${b.maxRaw}.` });
      }
      if (b.grade < 1.0 || b.grade > 5.0) {
        return res.status(400).json({ error: `Grade ${b.grade} must be between 1.0 and 5.0.` });
      }
    }

    const table = await TransmutationTable.create({
      name: name.trim(),
      description: (description || '').trim(),
      brackets: brackets.map(b => ({
        minRaw: b.minRaw,
        maxRaw: b.maxRaw,
        grade: b.grade,
        label: (b.label || '').trim()
      })),
      isActive: !!isActive,
      createdBy: req.adminId
    });

    return res.status(201).json({ success: true, data: table });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A table with this name already exists.' });
    }
    console.error('Error creating transmutation table:', error);
    return res.status(500).json({ error: 'Failed to create transmutation table.' });
  }
}

/**
 * PUT /registrar/transmutation-tables/:id
 * Update an existing table.
 */
async function updateTable(req, res) {
  try {
    const { name, description, brackets, isActive } = req.body || {};

    const update = { updatedBy: req.adminId };
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty.' });
      update.name = name.trim();
    }
    if (description !== undefined) update.description = description.trim();
    if (isActive !== undefined) update.isActive = !!isActive;

    if (brackets !== undefined) {
      if (!Array.isArray(brackets) || brackets.length === 0) {
        return res.status(400).json({ error: 'At least one bracket is required.' });
      }
      for (const b of brackets) {
        if (typeof b.minRaw !== 'number' || typeof b.maxRaw !== 'number' || typeof b.grade !== 'number') {
          return res.status(400).json({ error: 'Each bracket must have minRaw, maxRaw, and grade as numbers.' });
        }
        if (b.minRaw < 0 || b.maxRaw > 100 || b.minRaw > b.maxRaw) {
          return res.status(400).json({ error: `Invalid bracket range: ${b.minRaw}-${b.maxRaw}.` });
        }
        if (b.grade < 1.0 || b.grade > 5.0) {
          return res.status(400).json({ error: `Grade ${b.grade} must be between 1.0 and 5.0.` });
        }
      }
      update.brackets = brackets.map(b => ({
        minRaw: b.minRaw,
        maxRaw: b.maxRaw,
        grade: b.grade,
        label: (b.label || '').trim()
      }));
    }

    const table = await TransmutationTable.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!table) return res.status(404).json({ error: 'Transmutation table not found.' });
    return res.json({ success: true, data: table });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A table with this name already exists.' });
    }
    console.error('Error updating transmutation table:', error);
    return res.status(500).json({ error: 'Failed to update transmutation table.' });
  }
}

/**
 * DELETE /registrar/transmutation-tables/:id
 * Delete a table. Cannot delete the active table.
 */
async function deleteTable(req, res) {
  try {
    const table = await TransmutationTable.findById(req.params.id);
    if (!table) return res.status(404).json({ error: 'Transmutation table not found.' });
    if (table.isActive) {
      return res.status(400).json({ error: 'Cannot delete the active table. Deactivate it first.' });
    }
    await table.deleteOne();
    return res.json({ success: true, message: 'Transmutation table deleted.' });
  } catch (error) {
    console.error('Error deleting transmutation table:', error);
    return res.status(500).json({ error: 'Failed to delete transmutation table.' });
  }
}

/**
 * POST /registrar/transmutation-tables/:id/activate
 * Activate a table (deactivates all others).
 */
async function activateTable(req, res) {
  try {
    const table = await TransmutationTable.findById(req.params.id);
    if (!table) return res.status(404).json({ error: 'Transmutation table not found.' });
    table.isActive = true;
    table.updatedBy = req.adminId;
    await table.save();
    return res.json({ success: true, data: table, message: 'Table activated.' });
  } catch (error) {
    console.error('Error activating transmutation table:', error);
    return res.status(500).json({ error: 'Failed to activate transmutation table.' });
  }
}

/**
 * POST /registrar/transmutation-tables/transmute
 * Convert a raw score to a final grade using the active table.
 * Body: { rawScore: number }
 */
async function transmuteScore(req, res) {
  try {
    const { rawScore } = req.body || {};
    if (typeof rawScore !== 'number' || !isFinite(rawScore)) {
      return res.status(400).json({ error: 'rawScore must be a number.' });
    }
    const result = await TransmutationTable.transmuteWithActive(rawScore);
    if (!result) {
      return res.status(404).json({ error: 'No active transmutation table found.' });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error transmuting score:', error);
    return res.status(500).json({ error: 'Failed to transmute score.' });
  }
}

module.exports = {
  listTables,
  getActiveTable,
  getTable,
  createTable,
  updateTable,
  deleteTable,
  activateTable,
  transmuteScore
};
