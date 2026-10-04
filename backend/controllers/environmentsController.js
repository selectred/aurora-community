const prisma = require('../lib/prisma')

exports.list = async (req, res) => {
  try {
    const envs = await prisma.testEnvironment.findMany({ orderBy: { createdAt: 'asc' } })
    res.json(envs)
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch environments' })
  }
}

exports.getActive = async (req, res) => {
  try {
    const env = await prisma.testEnvironment.findFirst({ where: { isActive: true } })
    res.json(env || null)
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch active environment' })
  }
}

exports.create = async (req, res) => {
  const { name, baseUrl, variables, color, setActive } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })

  try {
    if (setActive) {
      await prisma.testEnvironment.updateMany({ data: { isActive: false } })
    }
    const env = await prisma.testEnvironment.create({
      data: {
        name: name.trim(),
        baseUrl: (baseUrl || '').trim(),
        variables: JSON.stringify(variables || {}),
        color: color || 'blue',
        isActive: !!setActive
      }
    })
    res.status(201).json(env)
  } catch (e) {
    res.status(500).json({ error: 'Failed to create environment' })
  }
}

exports.update = async (req, res) => {
  const { name, baseUrl, variables, color } = req.body
  try {
    const env = await prisma.testEnvironment.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(baseUrl !== undefined && { baseUrl: baseUrl.trim() }),
        ...(variables !== undefined && { variables: JSON.stringify(variables) }),
        ...(color !== undefined && { color })
      }
    })
    res.json(env)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Environment not found' })
    res.status(500).json({ error: 'Failed to update environment' })
  }
}

exports.activate = async (req, res) => {
  try {
    await prisma.testEnvironment.updateMany({ data: { isActive: false } })
    const env = await prisma.testEnvironment.update({
      where: { id: req.params.id },
      data: { isActive: true }
    })
    res.json(env)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Environment not found' })
    res.status(500).json({ error: 'Failed to activate environment' })
  }
}

exports.deactivate = async (req, res) => {
  try {
    await prisma.testEnvironment.update({
      where: { id: req.params.id },
      data: { isActive: false }
    })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Environment not found' })
    res.status(500).json({ error: 'Failed to deactivate environment' })
  }
}

exports.remove = async (req, res) => {
  try {
    await prisma.testEnvironment.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Environment not found' })
    res.status(500).json({ error: 'Failed to delete environment' })
  }
}
