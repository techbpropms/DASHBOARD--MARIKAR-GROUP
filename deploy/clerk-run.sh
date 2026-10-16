#!/usr/bin/env bash
# The hub's mailbox clerk on the VPS: one run of scripts/read_requests.py in the server's own clone of the
# repository: at once when a code is submitted on the hub (hub-clerk.path watches /srv/hub/log/submit.log) and
# every minute for the mailbox (hub-clerk.timer); deploy/clerk-setup.sh installs both. Each run:
#   1. brings /srv/hub/repo level with main (GitHub, over the clerk's deploy key);
#   2. runs the clerk on the mailbox and on the codes submitted on the hub (/srv/hub/log/submit.log);
#   3. commits what changed (data/requests/inbox.json, assets/auth.js), pushes it to main, and copies the two
#      files straight into the live site, so an approval or a new password works within seconds; the
#      "Deploy to VPS" workflow then publishes the same commit, which changes nothing further.
# While the deploy key is not yet allowed to write to the repository the run only says so and does nothing,
# and the "Mailbox requests" workflow on GitHub keeps settling requests as before. The settings come from
# /srv/hub/clerk/env (written by the "Install clerk on VPS" workflow). Status for the Settings page:
# /srv/hub/log/clerk.json, served as /clerk.json. RESET_NOW=<user id> in the environment is passed on.
set -uo pipefail
D=/srv/hub/clerk; R=/srv/hub/repo; SITE=/srv/hub/site; LOG=/srv/hub/log
REPO=git@github.com:techbpropms/DASHBOARD--MARIKAR-GROUP.git

mkdir -p "$D" "$LOG"; chmod 700 "$D"
exec > >(tee -a "$D/clerk.log") 2>&1
echo "== $(date -u +'%Y-%m-%d %H:%M:%S') UTC"
# runs queue behind one another (a submission arriving during the minute run, a reset passed from GitHub): wait, never skip
exec 9>"$D/lock"; flock -w 240 9 || { echo "another run has held the lock for four minutes; giving up this one"; exit 0; }

status() { # $1 ok (true/false), $2 note; the Settings page shows it
  printf '{"at":"%s","ok":%s,"note":"%s"}\n' "$(date -u +%FT%TZ)" "$1" "$2" > "$LOG/clerk.json.tmp" && mv -f "$LOG/clerk.json.tmp" "$LOG/clerk.json" && chmod 644 "$LOG/clerk.json"
  echo "$2"
}

[ -f "$D/env" ] && { set -a; . "$D/env"; set +a; }
if [ -z "${MAIL_PASSWORD:-}" ]; then status false "the mailbox password is not set on the server (run the Install clerk on VPS workflow)"; exit 0; fi
[ -f "$D/key" ] || ssh-keygen -q -t ed25519 -N '' -C "hub-clerk@vps" -f "$D/key"
export GIT_SSH_COMMAND="ssh -i $D/key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20"
export HOME=${HOME:-/root}; mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"
KEYNOTE="add the deploy key (deploy/README.md, Clerk on the VPS) with write access: $(cut -d' ' -f1,2 "$D/key.pub")"

if [ ! -d "$R/.git" ]; then
  git clone -q --depth 50 --single-branch --branch main "$REPO" "$R" 2>/dev/null || { status false "waiting for GitHub access; $KEYNOTE"; exit 0; }
fi
cd "$R"
git fetch -q origin main 2>/dev/null || { status false "cannot read the repository with the deploy key; $KEYNOTE"; exit 0; }
git reset -q --hard origin/main
git clean -qfd
git push -q --dry-run origin HEAD:main 2>/dev/null || { status false "the deploy key may read but not write; $KEYNOTE"; exit 0; }

cp -f "$LOG/submit.log" "$D/submissions.jsonl" 2>/dev/null || : > "$D/submissions.jsonl"
export APPROVERS="${APPROVERS:-drbabukollam@gmail.com,babukadavoor@gmail.com}"
python3 scripts/read_requests.py --submissions "$D/submissions.jsonl"; rc=$?
rm -f "$D/submissions.jsonl"
if [ $rc -ne 0 ]; then status false "the clerk script failed (exit $rc); see /srv/hub/clerk/clerk.log"; exit 0; fi

date +%s > "$D/last-run"
if git diff --quiet -- data/requests/inbox.json assets/auth.js; then status true "mailbox read; nothing new"; exit 0; fi
git -c user.name="Marikar hub mailbox" -c user.email="mml@bpropms.in" commit -q -m "Requests: settled from the hub mailbox" -- data/requests/inbox.json assets/auth.js
pushed=0
for i in 1 2 3; do
  if git push -q origin HEAD:main 2>/dev/null; then pushed=1; break; fi
  git fetch -q origin main && git rebase -q origin/main || { git rebase --abort 2>/dev/null; break; }
done
# the live site gets the two files at once, whether or not the push went through (the next run pushes again)
install -m 644 data/requests/inbox.json "$SITE/data/requests/inbox.json"
install -m 644 assets/auth.js "$SITE/assets/auth.js"
if [ $pushed = 1 ]; then status true "changes published: $(git rev-parse --short HEAD)"; else status false "changes applied on the site but not pushed to GitHub; will retry"; fi
