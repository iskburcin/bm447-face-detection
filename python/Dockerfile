# Python deney hattı (OpenCV 4.10 + ONNX Runtime, CPU)
FROM python:3.12-slim
WORKDIR /work
ENV PYTHONUTF8=1 PYTHONDONTWRITEBYTECODE=1 MPLBACKEND=Agg
COPY python/requirements.txt python/requirements.txt
RUN pip install --no-cache-dir -r python/requirements.txt
COPY python/ python/
WORKDIR /work/python
CMD ["python", "run_experiments.py"]
