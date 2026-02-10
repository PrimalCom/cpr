import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

async function seed() {
  const { auth } = await import('../lib/auth')

  console.log('Seeding database...')

  const email = 'demo@demo.com'
  const password = 'demodemo'

  try {
    const ctx = await auth.api.signUpEmail({
      body: { email, password, name: 'Demo User' },
    })
    console.log(`Created demo user: ${ctx.user.email}`)
  } catch (err: any) {
    if (err?.message?.includes('already exists') || err?.body?.code === 'USER_ALREADY_EXISTS') {
      console.log(`Demo user already exists: ${email}`)
    } else {
      throw err
    }
  }

  console.log('\nDemo login credentials:')
  console.log(`  Email:    ${email}`)
  console.log(`  Password: ${password}`)
  console.log('\nSeed complete!')
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
