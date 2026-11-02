FROM node:26.13.0-trixie

USER root

ENV DEBIAN_FRONTEND=noninteractive

ARG USERNAME="vscode"
ARG USER_UID=1001
ARG USER_GID=$USER_UID

RUN apt update \
    && apt install -y sudo findutils binutils pkg-config bash-completion gcc tar wget make curl openssh-client locales bash git gnupg2 ca-certificates vim xdg-utils gh libnspr4 libnss3 libatk1.0-0 libxdamage1 libxkbcommon0 libasound2t64 libatspi2.0-0 ripgrep

RUN groupadd --gid $USER_GID $USERNAME  && \
    useradd --uid $USER_UID --gid $USER_GID -m $USERNAME  && \
    echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME  && \
    chmod 0440 /etc/sudoers.d/$USERNAME

RUN chsh --shell /bin/bash ${USERNAME}

RUN echo 'export PS1="\[\033[0;32m\]\u\[\033[0m\] ➜ \[\033[1;34m\]\w\[\033[0m\] \$(if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then echo \"(\[\033[1;31m\]\$(git rev-parse --abbrev-ref HEAD)\[\033[0m\])\"; fi)\$ "' >> /home/$USERNAME/.bashrc

RUN echo "ja_JP.UTF-8 UTF-8" > /etc/locale.gen && \
    locale-gen && \
    dpkg-reconfigure locales && \
    /usr/sbin/update-locale LANG=ja_JP.UTF-8 LC_ALL=ja_JP.UTF-8

ENV LANG=ja_JP.UTF-8
ENV LC_ALL=ja_JP.UTF-8
ENV XDG_CONFIG_HOME=/tmp

WORKDIR /workspace

USER $USERNAME

SHELL ["/bin/bash", "-c"]
CMD ["/bin/bash"]
RUN curl -fsSL https://get.pnpm.io/install.sh | bash -
