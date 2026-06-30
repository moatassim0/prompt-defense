import { auth } from './src/lib/better-auth';
import { pool } from './src/db/index';

async function test() {
  try {
     console.log("Attempting sign up...");
     const res = await auth.api.signUpEmail({
       body: {
         email: "dummy@lab.com",
         password: "dummy1234password",
         name: "Dummy User"
       }
     });
     console.log("Signup:", res);
     const acc = await pool.query("SELECT * FROM account WHERE \"providerId\" = 'credential'");
     console.log("Account row:", acc.rows[acc.rows.length - 1]);
     process.exit(0);
  } catch (e) {
     console.error(e);
     process.exit(1);
  }
}
test();
