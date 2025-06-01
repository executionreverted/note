// Example usage of Autonote

const Autonote = require('../src/main.js')
const Corestore = require('corestore')

async function main() {
  // Create first instance (primary device)
  console.log('Setting up primary device...')
  const note1 = new Autonote(new Corestore('./vault1'))
  await note1.ready()

  // Set up user profile
  await note1.updateProfile({
    displayName: 'John Doe',
    email: 'john@example.com'
  })

  // Create some groups/folders
  const personalGroup = await note1.createGroup('Personal')
  const workGroup = await note1.createGroup('Work')
  const projectsGroup = await note1.createGroup('Projects', workGroup.id)

  console.log('Created groups:', { personalGroup, workGroup, projectsGroup })

  // Create some pages
  const page1 = await note1.createPage(
    'My First Note',
    '# Welcome to Autonote\n\nThis is my first note!',
    personalGroup.id,
    { tags: ['intro', 'personal'] }
  )

  const page2 = await note1.createPage(
    'Meeting Notes',
    '## Team Meeting\n\n- Discussed new features\n- Set deadlines',
    workGroup.id,
    { tags: ['meeting', 'team'], starred: true }
  )

  const page3 = await note1.createPage(
    'Project Ideas',
    '### Ideas\n\n1. Build a P2P app\n2. Learn Hypercore',
    projectsGroup.id,
    { tags: ['ideas', 'projects'] }
  )

  console.log('Created pages:', page1.title, page2.title, page3.title)

  // Generate invite for pairing with another device
  const invite = await note1.createInvite()
  console.log('\nShare this invite to pair with another device:', invite)

  // Simulate second device pairing
  console.log('\nSetting up second device...')
  const pair = Autonote.pair(new Corestore('./vault2'), invite)
  const note2 = await pair.finished()
  await note2.ready()

  console.log('Second device paired successfully!')

  // Wait a bit for sync
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Verify data is synced on second device
  const profile2 = await note2.getProfile()
  console.log('\nProfile on device 2:', profile2)

  const groups2 = await note2.listGroups()
  console.log(groups2)
  console.log('\nGroups on device 2:', groups2.map(g => g.name))

  const pages2 = await note2.listPages()
  console.log('\nPages on device 2:', pages2.map(p => p.title))

  // Make changes on device 2
  await note2.updatePage(page1.id, {
    content: page1.content + '\n\n## Update from Device 2\n\nThis was added from my second device!'
  })

  const newPage = await note2.createPage(
    'Note from Device 2',
    'This note was created on the second device',
    personalGroup.id,
    { tags: ['device2'] }
  )

  console.log('\nCreated new page on device 2:', newPage.title)

  // Wait for sync
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Check updates on device 1
  const updatedPage1 = await note1.getPage(page1.id)
  console.log('\nUpdated content on device 1:', updatedPage1.content)

  const allPages1 = await note1.listPages()
  console.log('\nAll pages on device 1:', allPages1.map(p => p.title))

  // Search functionality
  const searchResults = await note1.searchPages('project')
  console.log('\nSearch results for "project":', searchResults.map(p => p.title))

  // Get starred pages
  const starredPages = await note1.listPages({ starred: true })
  console.log('\nStarred pages:', starredPages.map(p => p.title))

  // Clean up
  await note1.close()
  await note2.close()
}

// Run the example
main().catch(console.error)
