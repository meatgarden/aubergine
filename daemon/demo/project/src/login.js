// A made-up file for the demo.
export function afterSignIn(session) {
  if (!session.valid) return '/sign-in';
  // The bug the stand-in agent is "fixing": the redirect is followed twice.
  return session.returnTo ?? '/home';
}
