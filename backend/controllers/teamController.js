// controllers/teamController.js
// Updated for desktop app with Prisma + SQLite
const prisma = require('../lib/prisma')
const {
  parseJson,
  stringifyJson,
  transformTeam,
  transformTeamMember,
  checkLimit
} = require('../lib/helpers')

// Helper to get or create singleton License
async function getCurrentLicense() {
  let license = await prisma.license.findFirst()
  if (!license) {
    license = await prisma.license.create({
      data: {
        tier: 'free',
        limitsJson: JSON.stringify({
          maxTeams: 2,
          maxMembersPerTeam: 5,
          maxSyntheticMonitors: 3,
          aiTestGeneration: true,
          continuumPush: false
        })
      }
    })
  }
  return license
}

exports.getAllTeams = async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      where: { isActive: true },
      include: {
        lead: true,
        members: {
          where: { isActive: true }
        }
      },
      orderBy: { name: 'asc' }
    })

    res.json({ success: true, teams: teams.map(transformTeam) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getTeamById = async (req, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        lead: true,
        members: {
          where: { isActive: true }
        }
      }
    })

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' })
    }

    res.json({ success: true, team: transformTeam(team) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.createTeam = async (req, res) => {
  try {
    const { name, description, color } = req.body

    // Check license limit
    const license = await getCurrentLicense()
    const limits = parseJson(license.limitsJson, { maxTeams: 2 })
    const teamCount = await prisma.team.count({ where: { isActive: true } })

    const limitCheck = checkLimit(limits, 'maxTeams', teamCount)
    if (!limitCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: `Team limit reached (${limits.maxTeams}). Upgrade your license for more teams.`
      })
    }

    const team = await prisma.team.create({
      data: {
        name,
        description: description || '',
        color: color || '#7367F0'
      }
    })

    // Update license usage
    const usage = parseJson(license.usageJson, { teams: 0 })
    usage.teams = teamCount + 1
    await prisma.license.update({
      where: { id: license.id },
      data: { usageJson: stringifyJson(usage) }
    })

    res.status(201).json({ success: true, team: transformTeam(team) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.updateTeam = async (req, res) => {
  try {
    const { name, description, color, lead } = req.body

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (color !== undefined) updateData.color = color
    if (lead !== undefined) updateData.leadId = lead

    const team = await prisma.team.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        lead: true,
        members: {
          where: { isActive: true }
        }
      }
    })

    res.json({ success: true, team: transformTeam(team) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.deleteTeam = async (req, res) => {
  try {
    // Soft delete - mark as inactive
    await prisma.team.update({
      where: { id: req.params.id },
      data: { isActive: false }
    })

    // Update license usage
    const license = await getCurrentLicense()
    const teamCount = await prisma.team.count({ where: { isActive: true } })
    const usage = parseJson(license.usageJson, { teams: 0 })
    usage.teams = teamCount
    await prisma.license.update({
      where: { id: license.id },
      data: { usageJson: stringifyJson(usage) }
    })

    res.json({ success: true, message: 'Team deleted successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getTeamMembers = async (req, res) => {
  try {
    const members = await prisma.teamMember.findMany({
      where: {
        teamId: req.params.id,
        isActive: true
      }
    })

    res.json({ success: true, members: members.map(transformTeamMember) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.addTeamMember = async (req, res) => {
  try {
    const { name, email, role } = req.body
    const teamId = req.params.id

    // Check license limit
    const license = await getCurrentLicense()
    const limits = parseJson(license.limitsJson, { maxMembersPerTeam: 5 })
    const memberCount = await prisma.teamMember.count({
      where: { teamId, isActive: true }
    })

    const limitCheck = checkLimit(limits, 'maxMembersPerTeam', memberCount)
    if (!limitCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: `Member limit reached (${limits.maxMembersPerTeam} per team). Upgrade your license.`
      })
    }

    const member = await prisma.teamMember.create({
      data: {
        name,
        email,
        role: role || 'qa_engineer',
        teamId
      }
    })

    // Update license usage
    const totalMembers = await prisma.teamMember.count({ where: { isActive: true } })
    const usage = parseJson(license.usageJson, { members: 0 })
    usage.members = totalMembers
    await prisma.license.update({
      where: { id: license.id },
      data: { usageJson: stringifyJson(usage) }
    })

    res.status(201).json({ success: true, member: transformTeamMember(member) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.updateTeamMember = async (req, res) => {
  try {
    const { name, email, role, isActive } = req.body

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (role !== undefined) updateData.role = role
    if (isActive !== undefined) updateData.isActive = isActive

    const member = await prisma.teamMember.update({
      where: { id: req.params.memberId },
      data: updateData
    })

    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' })
    }

    res.json({ success: true, member: transformTeamMember(member) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.removeTeamMember = async (req, res) => {
  try {
    // Soft delete
    await prisma.teamMember.update({
      where: { id: req.params.memberId },
      data: { isActive: false }
    })

    // Update license usage
    const license = await getCurrentLicense()
    const totalMembers = await prisma.teamMember.count({ where: { isActive: true } })
    const usage = parseJson(license.usageJson, { members: 0 })
    usage.members = totalMembers
    await prisma.license.update({
      where: { id: license.id },
      data: { usageJson: stringifyJson(usage) }
    })

    res.json({ success: true, message: 'Member removed successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Get team statistics
exports.getTeamStats = async (req, res) => {
  try {
    const teamId = req.params.id

    // Get test stats for this team
    const testResults = await prisma.testResult.groupBy({
      by: ['status'],
      where: { teamId },
      _count: { status: true }
    })

    const statsMap = testResults.reduce((acc, s) => {
      acc[s.status] = s._count.status
      return acc
    }, {})

    const total = Object.values(statsMap).reduce((a, b) => a + b, 0)
    const passed = statsMap.passed || 0

    res.json({
      success: true,
      stats: {
        total,
        passed,
        failed: statsMap.failed || 0,
        skipped: statsMap.skipped || 0,
        flaky: statsMap.flaky || 0,
        passRate: total > 0 ? Math.round((passed / total) * 100) : 0
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
