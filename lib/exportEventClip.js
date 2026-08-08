const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);

async function exportEventClip(videoPath, startSeconds, endSeconds, outputPath, eventMetadata) {
  if (typeof videoPath !== 'string' || !videoPath.trim()) throw new Error('Video not found');
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
    throw new Error('Invalid clip time range');
  }
  if (typeof outputPath !== 'string' || !outputPath.toLowerCase().endsWith('.mp4')) {
    throw new Error('outputPath must be an .mp4 file');
  }
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (fs.existsSync(outputPath)) {
    console.warn(`Warning: Output file ${outputPath} exists, will be overwritten.`);
  }

  let videoDuration;
  try {
    const { stdout } = await execFilePromise('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath]);
    videoDuration = parseFloat(stdout.trim());
    if (isNaN(videoDuration)) throw new Error('Could not determine video duration');
  } catch (err) {
    throw new Error('Video not found');
  }

  if (startSeconds >= videoDuration) {
    throw new Error('Start time exceeds video duration');
  }

  let actualEndSeconds = endSeconds;
  if (endSeconds > videoDuration) {
    actualEndSeconds = videoDuration;
    console.warn(`Warning: End time exceeds video duration, trimming to end at ${actualEndSeconds}s`);
  }

  const duration = actualEndSeconds - startSeconds;

  await execFilePromise('ffmpeg', ['-ss', String(startSeconds), '-i', videoPath, '-t', String(duration), '-c', 'copy', '-avoid_negative_ts', '1', outputPath, '-y']);

  const stats = fs.statSync(outputPath);
  return {
    outputFile: outputPath,
    durationSeconds: duration,
    fileSizeBytes: stats.size
  };
}

module.exports = { exportEventClip };
