import { randomUUID } from "node:crypto";
import { env } from "../src/config/env";
import { stationRepository } from "../src/db/repositories/station-repository";
import { userRepository } from "../src/db/repositories/user-repository";
import { pool } from "../src/db/client";
import { hashPassword } from "../src/security/password";

async function run() {
  const passwordHash = await hashPassword(env.DEMO_PASSWORD);

  const demoUser = await userRepository.ensureDemoUser(env.DEMO_EMAIL, env.DEMO_USER_NAME, passwordHash, randomUUID());
  if (!demoUser) {
    throw new Error("Unable to create demo user");
  }

  const station = await stationRepository.findByUserId(demoUser.id);
  if (!station) {
    await stationRepository.createStationWithDefaults({
      id: randomUUID(),
      userId: demoUser.id,
      name: "Demo Orbital Station",
      now: new Date()
    });
  }

  const activeStation = await stationRepository.findByUserId(demoUser.id);
  if (!activeStation) {
    throw new Error("Unable to initialize demo station");
  }

  await stationRepository.appendLog(activeStation.id, "system", "Demo station ready for recruiter walkthrough", {
    seededAt: new Date().toISOString()
  });
}

run()
  .then(async () => {
    await pool.end();
    console.log("Seed complete.");
  })
  .catch(async (error) => {
    console.error("Seed failed", error);
    await pool.end();
    process.exit(1);
  });
