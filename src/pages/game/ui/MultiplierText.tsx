export default function MultiplierText({ multiplier }: { multiplier: number }) {
  return <span>x{multiplier.toFixed(1)}</span>;
}