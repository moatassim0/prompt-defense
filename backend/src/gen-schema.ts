import { auth } from "./lib/better-auth";

async function main() {
  const { code } = await auth.api.generateNode();
  console.log(code);
}
main();
