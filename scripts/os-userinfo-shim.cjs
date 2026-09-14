// Workaround para ambientes Windows isolados onde os.userInfo() pode falhar
// antes de o Drizzle Kit iniciar. Não contém nem acessa credenciais.
// oxlint-disable-next-line typescript/no-require-imports
const os = require('node:os');

os.userInfo = () => ({
  uid: -1,
  gid: -1,
  username: process.env.USERNAME || 'developer',
  homedir: process.cwd(),
  shell: null,
});
