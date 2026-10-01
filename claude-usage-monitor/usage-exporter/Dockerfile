FROM python:3.12-slim
WORKDIR /app
# Sin dependencias externas: solo librería estándar
COPY exporter.py form.html ./
ENV PYTHONUNBUFFERED=1
EXPOSE 9101
USER nobody
CMD ["python", "exporter.py"]
