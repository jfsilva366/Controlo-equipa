function removeInvalidInviteLinks() {
  document.querySelectorAll('[data-copy-email]').forEach((button) => button.remove());
}

const inviteList = document.getElementById('inviteList');
if (inviteList) {
  new MutationObserver(removeInvalidInviteLinks).observe(inviteList, {
    childList: true,
    subtree: true
  });
}

removeInvalidInviteLinks();
