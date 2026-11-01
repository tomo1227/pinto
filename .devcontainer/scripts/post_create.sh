#!/usr/bin/env sh
wget https://raw.githubusercontent.com/git/git/master/contrib/completion/git-completion.bash -O ~/.git-completion.bash
echo "source ~/.git-completion.bash" >> ~/.bashrc

pnpm i
