"""
向量知识库服务
封装 ChromaDB 操作，提供知识条目的向量化存储和检索
"""
import asyncio
import json
import os
from typing import List, Optional, Dict, Any
from core.config import settings
from core.logging import get_logger

logger = get_logger(__name__)

# ChromaDB 客户端（延迟初始化）
_client = None
_collection = None


def _get_client():
    """获取 ChromaDB 客户端（单例）"""
    global _client
    if _client is None:
        import chromadb
        from chromadb.config import Settings as ChromaSettings
        
        persist_dir = settings.CHROMA_PERSIST_DIR
        os.makedirs(persist_dir, exist_ok=True)
        
        _client = chromadb.PersistentClient(
            path=persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False)
        )
        logger.info(f"ChromaDB 初始化完成，数据目录: {persist_dir}")
    
    return _client


def _get_collection():
    """获取知识库集合（单例）"""
    global _collection
    if _collection is None:
        client = _get_client()
        _collection = client.get_or_create_collection(
            name="knowledge_base",
            metadata={"hnsw:space": "cosine"}  # 使用余弦相似度
        )
        logger.info(f"知识库集合已创建，当前条目数: {_collection.count()}")
    
    return _collection


async def add_knowledge(
    knowledge_id: int,
    title: str,
    content: str,
    category: str,
    keywords: List[str] = None,
    priority: str = "medium",
    embedding: List[float] = None
) -> str:
    """添加知识条目到向量库
    
    Args:
        knowledge_id: 知识条目ID
        title: 标题
        content: 内容
        category: 分类
        keywords: 关键词列表
        priority: 优先级
        embedding: 预计算的向量（如果为None则使用传入的）
    
    Returns:
        向量ID
    """
    collection = _get_collection()
    vector_id = f"knowledge_{knowledge_id}"
    
    # 构建元数据
    metadata = {
        "title": title,
        "category": category,
        "priority": priority,
        "knowledge_id": knowledge_id,
    }
    if keywords:
        metadata["keywords"] = json.dumps(keywords, ensure_ascii=False)
    
    # 构建文档文本（用于搜索）
    doc_text = f"{title}\n{content}"
    if keywords:
        doc_text += f"\n关键词: {', '.join(keywords)}"
    
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: collection.upsert(
            ids=[vector_id],
            documents=[doc_text],
            embeddings=[embedding] if embedding else None,
            metadatas=[metadata]
        ))
        logger.info(f"知识条目已添加到向量库: {vector_id} ({title})")
        return vector_id
    except Exception as e:
        logger.error(f"添加知识条目到向量库失败: {e}")
        raise


async def update_knowledge(
    knowledge_id: int,
    title: str = None,
    content: str = None,
    category: str = None,
    keywords: List[str] = None,
    priority: str = None,
    embedding: List[float] = None
) -> bool:
    """更新知识条目向量"""
    collection = _get_collection()
    vector_id = f"knowledge_{knowledge_id}"
    
    try:
        # 先获取现有数据
        existing = collection.get(ids=[vector_id])
        if not existing or not existing['ids']:
            logger.warning(f"向量库中未找到条目: {vector_id}")
            return False
        
        # 构建更新内容
        update_doc = f"{title or existing['metadatas'][0].get('title', '')}\n{content or existing['documents'][0]}"
        if keywords:
            update_doc += f"\n关键词: {', '.join(keywords)}"
        
        update_metadata = existing['metadatas'][0].copy()
        if title:
            update_metadata["title"] = title
        if category:
            update_metadata["category"] = category
        if priority:
            update_metadata["priority"] = priority
        if keywords:
            update_metadata["keywords"] = json.dumps(keywords, ensure_ascii=False)
        
        update_kwargs = {
            "ids": [vector_id],
            "documents": [update_doc],
            "metadatas": [update_metadata]
        }
        if embedding:
            update_kwargs["embeddings"] = [embedding]
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: collection.update(**update_kwargs))
        logger.info(f"知识条目已更新: {vector_id}")
        return True
    except Exception as e:
        logger.error(f"更新知识条目失败: {e}")
        return False


async def delete_knowledge(knowledge_id: int) -> bool:
    """从向量库删除知识条目"""
    collection = _get_collection()
    vector_id = f"knowledge_{knowledge_id}"
    
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: collection.delete(ids=[vector_id]))
        logger.info(f"知识条目已从向量库删除: {vector_id}")
        return True
    except Exception as e:
        logger.error(f"删除知识条目失败: {e}")
        return False


async def search_knowledge(
    query_embedding: List[float],
    top_k: int = 5,
    category: str = None,
    min_score: float = 0.5
) -> List[Dict[str, Any]]:
    """搜索相似知识
    
    Args:
        query_embedding: 查询向量
        top_k: 返回结果数
        category: 限定分类（可选）
        min_score: 最小相似度阈值
    
    Returns:
        匹配的知识条目列表 [{knowledge_id, title, category, content, score}, ...]
    """
    collection = _get_collection()
    
    if collection.count() == 0:
        return []
    
    try:
        where_filter = None
        if category:
            where_filter = {"category": category}
        
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, lambda: collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection.count()),
            where=where_filter,
            include=["metadatas", "documents", "distances"]
        ))
        
        matched = []
        if results and results['ids'] and results['ids'][0]:
            for i, vid in enumerate(results['ids'][0]):
                # ChromaDB 返回的是距离（越小越相似），转换为相似度分数
                distance = results['distances'][0][i] if results['distances'] else 0
                score = 1 - distance  # cosine距离转相似度
                
                if score >= min_score:
                    metadata = results['metadatas'][0][i]
                    matched.append({
                        "knowledge_id": metadata.get("knowledge_id"),
                        "title": metadata.get("title", ""),
                        "category": metadata.get("category", ""),
                        "priority": metadata.get("priority", "medium"),
                        "score": round(score, 4),
                        "content": results['documents'][0][i] if results['documents'] else ""
                    })
        
        # 按分数排序
        matched.sort(key=lambda x: x["score"], reverse=True)
        return matched
    except Exception as e:
        logger.error(f"搜索知识库失败: {e}")
        return []


async def get_stats() -> Dict[str, Any]:
    """获取向量库统计信息"""
    collection = _get_collection()
    
    try:
        count = collection.count()
        return {
            "total_vectors": count,
            "status": "ok",
            "persist_dir": settings.CHROMA_PERSIST_DIR
        }
    except Exception as e:
        return {
            "total_vectors": 0,
            "status": "error",
            "error": str(e)
        }


async def sync_all(knowledge_items: List[Dict], embed_fn=None):
    """全量同步知识库到向量库
    
    Args:
        knowledge_items: 知识条目列表 [{id, title, content, category, keywords, priority}, ...]
        embed_fn: Embedding函数，接受文本返回向量
    """
    collection = _get_collection()
    
    # 清空现有数据
    try:
        collection.delete()
        logger.info("已清空向量库，开始全量同步...")
    except Exception:
        pass
    
    if not knowledge_items:
        logger.info("知识库为空，跳过同步")
        return
    
    ids = []
    documents = []
    metadatas = []
    embeddings = []
    
    for item in knowledge_items:
        vector_id = f"knowledge_{item['id']}"
        keywords = item.get('keywords', [])
        if isinstance(keywords, str):
            try:
                keywords = json.loads(keywords)
            except (json.JSONDecodeError, TypeError):
                keywords = []
        
        doc_text = f"{item['title']}\n{item['content']}"
        if keywords:
            doc_text += f"\n关键词: {', '.join(keywords)}"
        
        metadata = {
            "title": item['title'],
            "category": item.get('category', '其他'),
            "priority": item.get('priority', 'medium'),
            "knowledge_id": item['id'],
        }
        if keywords:
            metadata["keywords"] = json.dumps(keywords, ensure_ascii=False)
        
        ids.append(vector_id)
        documents.append(doc_text)
        metadatas.append(metadata)
        
        # 计算embedding
        if embed_fn:
            emb = await embed_fn(doc_text)
            if emb:
                embeddings.append(emb)
    
    try:
        kwargs = {
            "ids": ids,
            "documents": documents,
            "metadatas": metadatas,
        }
        if embeddings and len(embeddings) == len(ids):
            kwargs["embeddings"] = embeddings
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: collection.add(**kwargs))
        logger.info(f"全量同步完成，共同步 {len(ids)} 条知识")
    except Exception as e:
        logger.error(f"全量同步失败: {e}")
        raise