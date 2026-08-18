#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin="${OC_STATS_BIN:-$HOME/.local/bin}"

if [ ! -d "$repo/node_modules" ]; then
  echo "missing node_modules — run 'npm install' first" >&2
  exit 1
fi

npm run build

mkdir -p "$bin"
cat > "$bin/oc-stats" <<EOF
#!/usr/bin/env bash
cd "$repo" && npm start
EOF
chmod +x "$bin/oc-stats"

echo "installed oc-stats -> $bin/oc-stats"
echo "run 'oc-stats' and open http://localhost:8787"
if [[ ":$PATH:" != *":$bin:"* ]]; then
  echo "add $bin to your PATH: export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
