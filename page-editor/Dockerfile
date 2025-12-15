FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    apache2 \
    php \
    php-xml \
    libxml2-utils \
    libapache2-mod-php \
    git \
    && rm -rf /var/lib/apt/lists/*

# Enable headers module for CORS
RUN a2enmod headers

# Clone nw-page-editor
RUN rm -rf /var/www/html \
    && git clone --recursive https://github.com/mauvilsa/nw-page-editor.git /var/www/nw-page-editor

# Configure Apache
RUN echo "<Directory /var/www/nw-page-editor>\n\
    Options Indexes FollowSymLinks\n\
    AllowOverride All\n\
    Require all granted\n\
    Header set Access-Control-Allow-Origin \"*\"\n\
    </Directory>" > /etc/apache2/conf-available/nw-page-editor.conf \
    && a2enconf nw-page-editor \
    && echo "PassEnv CSS JS" >> /etc/apache2/apache2.conf

# Set DocumentRoot
RUN sed -i 's|/var/www/html|/var/www/nw-page-editor|g' /etc/apache2/sites-available/000-default.conf

# Visual Cache Buster in Title
# Robustly remove old relative links and inject new absolute ones (v1040)
# 1. Remove ANY line containing 'custom.css' (native link)
RUN sed -i '/custom\.css/d' /var/www/nw-page-editor/web-app/index.php
# Stale v2032 lines removed

# 2. Remove ANY line containing 'custom.js' (native script load)
RUN sed -i '/custom\.js/d' /var/www/nw-page-editor/web-app/index.php
# Create CSS/JS directories if they don't exist (safety)
RUN mkdir -p /var/www/nw-page-editor/css /var/www/nw-page-editor/js

# Fix Permissions: Align www-data with host UID 5000
RUN usermod -u 5000 www-data && groupmod -g 5000 www-data

# Fix Permissions for Data Directory (Critical for Saving)
RUN mkdir -p /var/www/nw-page-editor/data && \
    chown -R www-data:www-data /var/www/nw-page-editor/data && \
    chmod -R 775 /var/www/nw-page-editor/data

COPY custom.css /var/www/nw-page-editor/css/custom.css
COPY custom.js /var/www/nw-page-editor/js/custom.js
COPY index.php /var/www/nw-page-editor/web-app/index.php
COPY saveFile.php /var/www/nw-page-editor/web-app/saveFile.php

# Custom Menu Reordering and Renaming (Swap 'Lower pane' and 'Image', and rename)
# 1. Replace 'Lower pane' (hide-text-edit) with a marker to avoid double-matching
RUN sed -i 's|.*id="hide-text-edit".*|SWAP_MARKER|' /var/www/nw-page-editor/web-app/index.php
# 2. Replace 'Image' (hide-img) with the NEW 'Correction verification pane' logic (keeping hide-text-edit ID here)
RUN sed -i 's|.*id="hide-img".*|      <label id="hide-text-edit"><input class="mousetrap" type="checkbox" checked=""/> Correction verification pane</label>|' /var/www/nw-page-editor/web-app/index.php
# 3. Replace the marker with the NEW 'Background image pane' logic (keeping hide-img ID here)
RUN sed -i 's|SWAP_MARKER|      <label id="hide-img"><input class="mousetrap" type="checkbox" checked=""/> Background image pane</label>|' /var/www/nw-page-editor/web-app/index.php

# 3. Inject new CSS at the end of head
RUN sed -i 's|</head>|<link rel="stylesheet" href="/editor/css/custom.css" /></head>|' /var/www/nw-page-editor/web-app/index.php
RUN sed -i 's|</body>|<script src="/editor/js/custom.js"></script></body>|' /var/www/nw-page-editor/web-app/index.php
# 5. Update Title
RUN sed -i 's|<title>.*</title>|<title>PageXML Editor</title>|' /var/www/nw-page-editor/web-app/index.php

WORKDIR /var/www

CMD ["apachectl", "-D", "FOREGROUND"]
