FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    apache2 \
    php \
    libapache2-mod-php \
    git \
    && rm -rf /var/lib/apt/lists/*

# Enable headers module for CORS
RUN a2enmod headers

# Clone nw-page-editor
RUN rm -rf /var/www/html \
    && git clone https://github.com/mauvilsa/nw-page-editor.git /var/www/nw-page-editor

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

# Inject CSS with cache buster (Relative Path for Nginx Proxy)
RUN sed -i 's|</head>|\n<link rel="stylesheet" type="text/css" href="../css/custom.css?v=1028"></head>|' /var/www/nw-page-editor/web-app/index.php
# Inject JS (Relative Path for Nginx Proxy)
RUN sed -i 's|</body>|\n<script src="../js/custom.js?v=1028"></script></body>|' /var/www/nw-page-editor/web-app/index.php

WORKDIR /var/www

CMD ["apachectl", "-D", "FOREGROUND"]
