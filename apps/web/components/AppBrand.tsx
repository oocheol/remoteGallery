import Link from "next/link";
export function AppBrand() {
  return (
    <Link className="brand" href="/">
      <span className="brand-mark">G</span>
      <span>Gallery Twin</span>
    </Link>
  );
}
