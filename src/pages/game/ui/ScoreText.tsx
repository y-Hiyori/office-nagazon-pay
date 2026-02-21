export default function ScoreText({ score }: { score: number }) {
  return <span>SCORE: {score.toLocaleString("ja-JP")}</span>;
}