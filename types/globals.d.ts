export {}

// Clerk session token claims — `metadata` mapira `user.public_metadata`
// (vidi Clerk Dashboard → Sessions → Customize session token).
declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      role?: 'admin' | 'user'
    }
  }
}
