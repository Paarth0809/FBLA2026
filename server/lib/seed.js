// seed.js — Creates starter data when the server runs for the first time
const bcrypt = require('bcryptjs');
const { readJSON, writeJSON } = require('./db');

function seed() {
  // ── Users ──────────────────────────────────────────────────────────────────
  let users = readJSON('users.json');
  if (!users.find(u => u.role === 'admin')) {
    users.push({
      id: 'admin-001',
      name: 'Administrator',
      email: 'admin@school.edu',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    users.push({
      id: 'user-001',
      name: 'Alex Chen',
      email: 'student@school.edu',
      passwordHash: bcrypt.hashSync('student123', 10),
      role: 'user',
      createdAt: new Date().toISOString()
    });
    writeJSON('users.json', users);
    console.log('  ✓ Admin account:   admin@school.edu   / admin123');
    console.log('  ✓ Demo student:    student@school.edu / student123');
  }

  // ── Found Items ────────────────────────────────────────────────────────────
  let items = readJSON('items.json');
  if (items.length === 0) {
    items = [
      {
        id: 'item-001',
        itemName: 'Blue North Face Backpack',
        category: 'Bags & Backpacks',
        description: 'Large blue North Face backpack with red zipper pulls. Has a water bottle holder on the side and a keychain attached. Found near the library entrance doors.',
        locationFound: 'Library Entrance',
        dateFound: '2026-02-15',
        contactEmail: 'admin@school.edu',
        photo: null,
        status: 'approved',
        submittedBy: 'admin-001',
        submitterName: 'Staff Member',
        createdAt: '2026-02-15T10:30:00.000Z'
      },
      {
        id: 'item-002',
        itemName: 'iPhone 14 (Space Gray)',
        category: 'Electronics',
        description: 'Space gray iPhone 14 with a clear protective case. Screen has a small scratch in the bottom right corner. Found on a lunch table in the cafeteria.',
        locationFound: 'Cafeteria',
        dateFound: '2026-02-18',
        contactEmail: 'admin@school.edu',
        photo: null,
        status: 'approved',
        submittedBy: 'admin-001',
        submitterName: 'Staff Member',
        createdAt: '2026-02-18T12:15:00.000Z'
      },
      {
        id: 'item-003',
        itemName: 'White Wireless Earbuds',
        category: 'Electronics',
        description: 'White wireless earbuds in a white charging case. Appears to be Apple AirPods. Found on the gym bleachers after 3rd period PE class.',
        locationFound: 'Gymnasium – Bleachers',
        dateFound: '2026-02-20',
        contactEmail: 'admin@school.edu',
        photo: null,
        status: 'approved',
        submittedBy: 'admin-001',
        submitterName: 'Coach Williams',
        createdAt: '2026-02-20T14:00:00.000Z'
      },
      {
        id: 'item-004',
        itemName: 'Student ID Card',
        category: 'Keys & ID Cards',
        description: 'A student ID card found in the 200 hallway near the water fountain. Name is visible on the card.',
        locationFound: 'Hallway B – Near Water Fountain',
        dateFound: '2026-02-22',
        contactEmail: 'admin@school.edu',
        photo: null,
        status: 'approved',
        submittedBy: 'admin-001',
        submitterName: 'Staff Member',
        createdAt: '2026-02-22T09:45:00.000Z'
      },
      {
        id: 'item-005',
        itemName: 'AP Calculus Textbook',
        category: 'Books & Supplies',
        description: 'AP Calculus AB textbook, Larson 10th edition. Has a student name written in marker on the inside front cover. Found in classroom 204 after school.',
        locationFound: 'Room 204',
        dateFound: '2026-02-28',
        contactEmail: 'admin@school.edu',
        photo: null,
        status: 'approved',
        submittedBy: 'admin-001',
        submitterName: 'Mr. Johnson',
        createdAt: '2026-02-28T15:30:00.000Z'
      },
      {
        id: 'item-006',
        itemName: 'Black Compact Umbrella',
        category: 'Other',
        description: 'Standard black folding compact umbrella. Found near the main entrance after rain on Wednesday morning. In good condition.',
        locationFound: 'Main Entrance',
        dateFound: '2026-02-26',
        contactEmail: 'admin@school.edu',
        photo: null,
        status: 'approved',
        submittedBy: 'admin-001',
        submitterName: 'Front Office',
        createdAt: '2026-02-26T08:00:00.000Z'
      },
      {
        id: 'item-007',
        itemName: 'Red Hydro Flask Water Bottle',
        category: 'Other',
        description: 'Red 32oz Hydro Flask with mountain and sunset stickers on the side. Found on the track field after afternoon practice.',
        locationFound: 'Track & Field',
        dateFound: '2026-03-01',
        contactEmail: 'admin@school.edu',
        photo: null,
        status: 'pending',
        submittedBy: 'user-001',
        submitterName: 'Alex Chen',
        createdAt: '2026-03-01T16:00:00.000Z'
      }
    ];
    writeJSON('items.json', items);
    console.log(`  ✓ Seeded ${items.length} found items`);
  }

  // ── Missing Items ──────────────────────────────────────────────────────────
  let missingItems = readJSON('missing-items.json');
  if (missingItems.length === 0) {
    missingItems = [
      {
        id: 'missing-001',
        itemName: 'Blue Hydro Flask',
        category: 'Other',
        description: 'Blue 24oz Hydro Flask with a "Protect Our Oceans" sticker. My name is written on the bottom in permanent marker. Last seen at lunch.',
        lastSeenLocation: 'Cafeteria',
        lastSeenDate: '2026-02-10',
        contactEmail: 'student@school.edu',
        photo: null,
        status: 'approved',
        submittedBy: 'user-001',
        submitterName: 'Alex Chen',
        createdAt: '2026-02-10T13:00:00.000Z'
      },
      {
        id: 'missing-002',
        itemName: 'HP Laptop Charger',
        category: 'Electronics',
        description: 'HP 45W laptop charger. Has a piece of blue tape near the connector end for identification. Left it in the library study room.',
        lastSeenLocation: 'Library – Study Room 3',
        lastSeenDate: '2026-02-14',
        contactEmail: 'student@school.edu',
        photo: null,
        status: 'approved',
        submittedBy: 'user-001',
        submitterName: 'Alex Chen',
        createdAt: '2026-02-14T11:30:00.000Z'
      },
      {
        id: 'missing-003',
        itemName: 'Gray Champion Hoodie',
        category: 'Clothing',
        description: 'Gray Champion hoodie, size Large. Has a small ink stain near the kangaroo pocket. Left it in the locker room before PE class.',
        lastSeenLocation: 'Girls Locker Room',
        lastSeenDate: '2026-02-28',
        contactEmail: 'student@school.edu',
        photo: null,
        status: 'pending',
        submittedBy: 'user-001',
        submitterName: 'Alex Chen',
        createdAt: '2026-02-28T10:00:00.000Z'
      }
    ];
    writeJSON('missing-items.json', missingItems);
    console.log(`  ✓ Seeded ${missingItems.length} missing items`);
  }

  // ── Claims ─────────────────────────────────────────────────────────────────
  let claims = readJSON('claims.json');
  if (claims.length === 0) {
    claims = [
      {
        id: 'claim-001',
        itemId: 'item-001',
        itemType: 'found',
        itemName: 'Blue North Face Backpack',
        claimerName: 'Michael Torres',
        claimerEmail: 'michael@school.edu',
        claimerPhone: '555-0101',
        description: 'This is my backpack. I have my science homework in the front pocket and my lunch box in the main compartment. The left side zipper is slightly broken.',
        submittedBy: 'user-001',
        status: 'pending',
        createdAt: '2026-02-16T09:00:00.000Z'
      }
    ];
    writeJSON('claims.json', claims);
    console.log('  ✓ Seeded 1 sample claim');
  }
}

module.exports = seed;
