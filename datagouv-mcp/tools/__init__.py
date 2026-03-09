from mcp.server.fastmcp import FastMCP

from tools.download_and_parse_resource import (
    register_download_and_parse_resource_tool,
)
from tools.download_dataset_to_cache import register_download_dataset_to_cache_tool
from tools.query_cache import register_query_cache_tool
from tools.get_dataservice_info import register_get_dataservice_info_tool
from tools.get_dataservice_openapi_spec import (
    register_get_dataservice_openapi_spec_tool,
)
from tools.get_dataset_info import register_get_dataset_info_tool
from tools.get_delinquance_commune import register_get_delinquance_commune_tool
from tools.get_ecoles_commune import register_get_ecoles_commune_tool
from tools.get_dpe_commune import register_get_dpe_commune_tool
from tools.get_dvf_comparables import register_get_dvf_comparables_tool
from tools.get_dvf_historique_commune import (
    register_get_dvf_historique_commune_tool,
)
from tools.get_dvf_sections_commune import register_get_dvf_sections_commune_tool
from tools.get_dvf_par_rue import register_get_dvf_par_rue_tool
from tools.get_logements_sociaux_commune import (
    register_get_logements_sociaux_commune_tool,
)
from tools.get_pyramide_ages_commune import (
    register_get_pyramide_ages_commune_tool,
)
from tools.get_stock_logements_commune import (
    register_get_stock_logements_commune_tool,
)
from tools.get_metrics import register_get_metrics_tool
from tools.get_resource_info import register_get_resource_info_tool
from tools.list_dataset_resources import register_list_dataset_resources_tool
from tools.query_resource_data import register_query_resource_data_tool
from tools.resolve_commune import register_resolve_commune_tool
from tools.search_dataservices import register_search_dataservices_tool
from tools.search_datasets import register_search_datasets_tool


def register_tools(mcp: FastMCP) -> None:
    """Register all MCP tools with the provided FastMCP instance."""
    register_resolve_commune_tool(mcp)
    register_search_datasets_tool(mcp)
    register_search_dataservices_tool(mcp)
    register_get_dataservice_info_tool(mcp)
    register_get_dataservice_openapi_spec_tool(mcp)
    register_query_resource_data_tool(mcp)
    register_get_dataset_info_tool(mcp)
    register_get_delinquance_commune_tool(mcp)
    register_get_ecoles_commune_tool(mcp)
    register_get_dpe_commune_tool(mcp)
    register_get_logements_sociaux_commune_tool(mcp)
    register_get_dvf_comparables_tool(mcp)
    register_get_dvf_historique_commune_tool(mcp)
    register_get_dvf_sections_commune_tool(mcp)
    register_get_dvf_par_rue_tool(mcp)
    register_get_pyramide_ages_commune_tool(mcp)
    register_get_stock_logements_commune_tool(mcp)
    register_list_dataset_resources_tool(mcp)
    register_get_resource_info_tool(mcp)
    register_download_and_parse_resource_tool(mcp)
    register_get_metrics_tool(mcp)
    register_download_dataset_to_cache_tool(mcp)
    register_query_cache_tool(mcp)
