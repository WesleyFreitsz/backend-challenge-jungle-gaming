import "dotenv/config";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "../src/infrastructure/database/mikro-orm.config";

async function migrate() {
  console.log(`\n🚀 Conectando ao PostgreSQL...`);
  console.log(`   Host:     ${config.host}:${config.port}`);
  console.log(`   Database: ${config.dbName}`);
  console.log(`   User:     ${config.user}\n`);

  const orm = await MikroORM.init(config);
  const migrator = orm.migrator;
  const executed = await migrator.up();

  if (executed.length === 0) {
    console.log("✅ O banco de dados já está atualizado!");
  } else {
    console.log(`✅ Sucesso! ${executed.length} migração(ões) aplicada(s):`);
    executed.forEach((m: any) => console.log(`   - ${m.name}`));
  }

  await orm.close(true);
  process.exit(0);
}

migrate().catch((error) => {
  console.error("❌ Erro ao executar migrações:", error);
  process.exit(1);
});
