# Frontend Dockerfile cho HCM202
FROM nginx:alpine

# Tạo thư mục làm việc
WORKDIR /usr/share/nginx/html

# Copy static files
COPY . /usr/share/nginx/html/

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
