// Comprehensive Autonote Sync Test
// Tests pairing, profile sync, group sync, note sync, and deletion sync

const Autonote = require('../src/main.js')
const Corestore = require('corestore')
const fs = require('fs')
const path = require('path')

// Helper function to wait for sync
async function waitForSync(ms = 1500) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

// Helper function to clean up test directories
function cleanupTestDirs() {
  const dirs = ['./test-vault1', './test-vault2']
  dirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
}

// Helper function to assert equality
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`✓ ${message}`)
}

async function runComprehensiveTest() {
  console.log('🧪 Starting Comprehensive Autonote Sync Test\n')

  // Clean up any existing test data
  cleanupTestDirs()

  let device1, device2

  try {
    // ========================================
    // TEST 1: PAIRING WORKS
    // ========================================
    console.log('📱 TEST 1: Device Pairing')
    console.log('---------------------------')

    // Setup device 1
    console.log('Setting up device 1...')
    device1 = new Autonote(new Corestore('./test-vault1'))
    await device1.ready()

    // Generate invite
    const invite = await device1.createInvite()
    console.log('Generated invite:', invite.substring(0, 20) + '...')

    // Setup device 2 with pairing
    console.log('Setting up device 2 and pairing...')
    const pair = Autonote.pair(new Corestore('./test-vault2'), invite)
    device2 = await pair.finished()
    await device2.ready()

    // Verify both devices are writable
    assert(device1.writable, 'Device 1 should be writable')
    assert(device2.writable, 'Device 2 should be writable')
    assert(device1.key.equals(device2.key), 'Both devices should have the same key')

    console.log('✅ Pairing test passed!\n')

    // ========================================
    // TEST 2: PROFILE SYNC
    // ========================================
    console.log('👤 TEST 2: Profile Synchronization')
    console.log('-----------------------------------')

    // Set profile on device 1
    const originalProfile = {
      displayName: 'Alice Smith',
      email: 'alice@example.com'
    }

    console.log('Setting profile on device 1...')
    await device1.updateProfile(originalProfile)

    // Wait for sync and check on device 2
    await waitForSync()
    const syncedProfile = await device2.getProfile()

    assert(syncedProfile !== null, 'Profile should exist on device 2')
    assert(syncedProfile.displayName === originalProfile.displayName, 'Display name should sync')
    assert(syncedProfile.email === originalProfile.email, 'Email should sync')
    console.log('Synced profile:', syncedProfile.displayName, syncedProfile.email)

    // Update profile on device 2
    console.log('Updating profile on device 2...')
    await device2.updateProfile({
      ...originalProfile,
      displayName: 'Alice Johnson',
      email: 'alice.johnson@example.com'
    })

    // Wait for sync and check on device 1
    await waitForSync()
    const updatedProfile = await device1.getProfile()

    assert(updatedProfile.displayName === 'Alice Johnson', 'Updated display name should sync back')
    assert(updatedProfile.email === 'alice.johnson@example.com', 'Updated email should sync back')

    console.log('✅ Profile sync test passed!\n')

    // ========================================
    // TEST 3: GROUP CREATION AND SYNC
    // ========================================
    console.log('📁 TEST 3: Group Creation and Synchronization')
    console.log('----------------------------------------------')

    // Create groups on device 1
    console.log('Creating groups on device 1...')
    const personalGroup = await device1.createGroup('Personal Notes', null, { color: '#ff6b6b' })
    const workGroup = await device1.createGroup('Work Projects', null, { color: '#4ecdc4' })
    const subGroup = await device1.createGroup('Team Meetings', workGroup.id, { color: '#45b7d1' })

    // Wait for sync and verify on device 2
    await waitForSync()
    const device2Groups = await device2.listGroups()

    assert(device2Groups.length === 3, 'Device 2 should have 3 groups')

    const device2Personal = device2Groups.find(g => g.name === 'Personal Notes')
    const device2Work = device2Groups.find(g => g.name === 'Work Projects')
    const device2Sub = device2Groups.find(g => g.name === 'Team Meetings')

    assert(device2Personal !== undefined, 'Personal group should sync to device 2')
    assert(device2Work !== undefined, 'Work group should sync to device 2')
    assert(device2Sub !== undefined, 'Sub group should sync to device 2')
    assert(device2Sub.parentId === device2Work.id, 'Parent-child relationship should sync')
    assert(device2Personal.color === '#ff6b6b', 'Group color should sync')

    console.log('Groups synced successfully:', device2Groups.map(g => g.name))

    // Create a group on device 2
    console.log('Creating group on device 2...')
    const hobbyGroup = await device2.createGroup('Hobbies', null, { color: '#96ceb4' })

    // Wait for sync and verify on device 1
    await waitForSync()
    const device1Groups = await device1.listGroups()

    assert(device1Groups.length === 4, 'Device 1 should now have 4 groups')

    const device1Hobby = device1Groups.find(g => g.name === 'Hobbies')
    assert(device1Hobby !== undefined, 'Hobby group should sync to device 1')
    assert(device1Hobby.color === '#96ceb4', 'Hobby group color should sync')

    console.log('✅ Group sync test passed!\n')

    // ========================================
    // TEST 4: NOTE CREATION AND SYNC
    // ========================================
    console.log('📝 TEST 4: Note Creation and Synchronization')
    console.log('---------------------------------------------')

    // Create notes on device 1
    console.log('Creating notes on device 1...')
    const note1 = await device1.createPage(
      'Welcome Note',
      '# Welcome to Autonote\n\nThis is my first synchronized note!',
      personalGroup.id,
      { tags: ['welcome', 'intro'], starred: true }
    )

    const note2 = await device1.createPage(
      'Project Planning',
      '## Q1 Goals\n\n- Launch new feature\n- Improve performance',
      workGroup.id,
      { tags: ['planning', 'q1'] }
    )

    // Wait for sync and verify on device 2
    await waitForSync()
    const device2Notes = await device2.listPages()

    assert(device2Notes.length === 2, 'Device 2 should have 2 notes')

    const device2Note1 = device2Notes.find(n => n.title === 'Welcome Note')
    const device2Note2 = device2Notes.find(n => n.title === 'Project Planning')

    assert(device2Note1 !== undefined, 'Welcome note should sync to device 2')
    assert(device2Note2 !== undefined, 'Project note should sync to device 2')
    assert(device2Note1.content.includes('first synchronized note'), 'Note content should sync')
    assert(device2Note1.tags.includes('welcome'), 'Note tags should sync')
    assert(device2Note1.starred === true, 'Starred status should sync')
    assert(device2Note1.groupId === personalGroup.id, 'Group assignment should sync')

    console.log('Notes synced successfully:', device2Notes.map(n => n.title))

    // Create and update note on device 2
    console.log('Creating and updating note on device 2...')
    const note3 = await device2.createPage(
      'Device 2 Note',
      'This note was created on device 2',
      hobbyGroup.id,
      { tags: ['device2', 'test'] }
    )

    // Update existing note on device 2
    await device2.updatePage(note1.id, {
      content: device2Note1.content + '\n\n## Update from Device 2\n\nThis was added from device 2!',
      tags: [...device2Note1.tags, 'updated']
    })

    // Wait for sync and verify on device 1
    await waitForSync()
    const device1Notes = await device1.listPages()

    assert(device1Notes.length === 3, 'Device 1 should now have 3 notes')

    const device1Note3 = device1Notes.find(n => n.title === 'Device 2 Note')
    const device1UpdatedNote = await device1.getPage(note1.id)

    assert(device1Note3 !== undefined, 'Device 2 note should sync to device 1')
    assert(device1Note3.content === 'This note was created on device 2', 'Device 2 note content should sync')
    assert(device1UpdatedNote.content.includes('Update from Device 2'), 'Note updates should sync')
    assert(device1UpdatedNote.tags.includes('updated'), 'Updated tags should sync')

    console.log('✅ Note sync test passed!\n')

    // ========================================
    // TEST 5: DELETION SYNC
    // ========================================
    console.log('🗑️  TEST 5: Deletion Synchronization')
    console.log('------------------------------------')

    // Delete a note on device 1
    console.log('Deleting note on device 1...')
    await device1.deletePage(note2.id)

    // Wait for sync and verify deletion on device 2
    await waitForSync()
    const device2NotesAfterDelete = await device2.listPages()

    assert(device2NotesAfterDelete.length === 2, 'Device 2 should have 2 notes after deletion')
    assert(!device2NotesAfterDelete.find(n => n.id === note2.id), 'Deleted note should not exist on device 2')

    console.log('Note deletion synced successfully')

    // Delete a group on device 2 (should fail if it has notes)
    console.log('Testing group deletion with notes...')
    try {
      await device2.deleteGroup(hobbyGroup.id)
      assert(false, 'Should not be able to delete group with notes')
    } catch (error) {
      assert(error.message.includes('Cannot delete group with pages'), 'Should get proper error message')
      console.log('✓ Correctly prevented deletion of group with notes')
    }

    // Delete the note in hobby group first, then delete the group
    console.log('Deleting note then group on device 2...')
    await device2.deletePage(note3.id)
    await waitForSync(1000)
    await device2.deleteGroup(hobbyGroup.id)

    // Wait for sync and verify on device 1
    await waitForSync()
    const device1NotesAfterGroupDelete = await device1.listPages()
    const device1GroupsAfterDelete = await device1.listGroups()

    assert(device1NotesAfterGroupDelete.length === 1, 'Device 1 should have 1 note after all deletions')
    assert(!device1NotesAfterGroupDelete.find(n => n.id === note3.id), 'Device 2 note should be deleted on device 1')
    assert(!device1GroupsAfterDelete.find(g => g.id === hobbyGroup.id), 'Hobby group should be deleted on device 1')

    console.log('✅ Deletion sync test passed!\n')

    // ========================================
    // FINAL VERIFICATION
    // ========================================
    console.log('🔍 FINAL VERIFICATION')
    console.log('---------------------')

    const finalDevice1Profile = await device1.getProfile()
    const finalDevice2Profile = await device2.getProfile()
    const finalDevice1Groups = await device1.listGroups()
    const finalDevice2Groups = await device2.listGroups()
    const finalDevice1Notes = await device1.listPages()
    const finalDevice2Notes = await device2.listPages()

    assert(finalDevice1Profile.displayName === finalDevice2Profile.displayName, 'Final profiles should match')
    assert(finalDevice1Groups.length === finalDevice2Groups.length, 'Final group counts should match')
    assert(finalDevice1Notes.length === finalDevice2Notes.length, 'Final note counts should match')

    console.log('Final state:')
    console.log(`- Profile: ${finalDevice1Profile.displayName} (${finalDevice1Profile.email})`)
    console.log(`- Groups: ${finalDevice1Groups.length} (${finalDevice1Groups.map(g => g.name).join(', ')})`)
    console.log(`- Notes: ${finalDevice1Notes.length} (${finalDevice1Notes.map(n => n.title).join(', ')})`)

    console.log('\n🎉 ALL TESTS PASSED! Autonote synchronization is working perfectly!')

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    // Clean up
    if (device1) await device1.close()
    if (device2) await device2.close()

    // Give a moment for cleanup then remove test directories
    setTimeout(() => {
      cleanupTestDirs()
      console.log('\n🧹 Test cleanup completed')
    }, 1000)
  }
}

// Run the test
if (require.main === module) {
  runComprehensiveTest().catch(console.error)
}

module.exports = { runComprehensiveTest }
