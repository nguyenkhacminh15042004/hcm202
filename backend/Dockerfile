# Sử dụng Node.js LTS Alpine để image nhẹ hơn
FROM node:18-alpine

# Tạo thư mục làm việc
WORKDIR /app

# Cài đặt công cụ cần cho healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Cài đặt dependencies
RUN npm install --omit=dev

# Copy source code
COPY . .

# Tạo user non-root để bảo mật
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Thay đổi ownership của thư mục app
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/v1/health || exit 1

# Khởi chạy ứng dụng
CMD ["npm", "start"]
