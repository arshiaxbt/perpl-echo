import { collectSnapshotsOnce } from "../src/worker/collector";

collectSnapshotsOnce()
  .then((result) => {
    console.log(`Seed collector saved ${result.snapshotsSaved} snapshots.`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
