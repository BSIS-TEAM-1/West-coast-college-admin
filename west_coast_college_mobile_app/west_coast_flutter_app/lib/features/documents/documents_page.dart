import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_provider.dart';
import '../../../shared/widgets/app_bottom_nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_dimensions.dart';
import '../../../core/theme/app_text_styles.dart';

class DocumentsPage extends StatefulWidget {
  const DocumentsPage({super.key});

  @override
  State<DocumentsPage> createState() => _DocumentsPageState();
}

class _DocumentsPageState extends State<DocumentsPage> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final List<String> _selectedFilters = ['All'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final student = authProvider.student;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Documents'),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.onPrimary,
          labelColor: AppColors.onPrimary,
          unselectedLabelColor: AppColors.onPrimary.withOpacity(0.7),
          tabs: const [
            Tab(text: 'Available'),
            Tab(text: 'Requested'),
            Tab(text: 'All'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildAvailableDocuments(),
          _buildRequestedDocuments(),
          _buildAllDocuments(),
        ],
      ),
      bottomNavigationBar: const AppBottomNav(currentPath: '/documents'),
    );
  }

  Widget _buildAvailableDocuments() {
    final documents = _getSampleAvailableDocuments();
    
    return ListView.builder(
      padding: const EdgeInsets.all(AppDimensions.lg),
      itemCount: documents.length,
      itemBuilder: (context, index) {
        final document = documents[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: AppDimensions.md),
          child: _buildDocumentCard(document, canRequest: true),
        );
      },
    );
  }

  Widget _buildRequestedDocuments() {
    final documents = _getSampleRequestedDocuments();
    
    if (documents.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.folder_open,
              size: 64,
              color: AppColors.textMuted,
            ),
            const SizedBox(height: AppDimensions.md),
            Text(
              'No document requests',
              style: AppTextStyles.bodyMedium.copyWith(
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: AppDimensions.sm),
            Text(
              'Request documents from the Available tab',
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.textMuted,
              ),
            ),
          ],
        ),
      );
    }
    
    return ListView.builder(
      padding: const EdgeInsets.all(AppDimensions.lg),
      itemCount: documents.length,
      itemBuilder: (context, index) {
        final document = documents[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: AppDimensions.md),
          child: _buildDocumentCard(document, canRequest: false),
        );
      },
    );
  }

  Widget _buildAllDocuments() {
    final allDocuments = [..._getSampleAvailableDocuments(), ..._getSampleRequestedDocuments()];
    
    return ListView.builder(
      padding: const EdgeInsets.all(AppDimensions.lg),
      itemCount: allDocuments.length,
      itemBuilder: (context, index) {
        final document = allDocuments[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: AppDimensions.md),
          child: _buildDocumentCard(document, canRequest: false),
        );
      },
    );
  }

  Widget _buildDocumentCard(DocumentItem document, {required bool canRequest}) {
    return Card(
      elevation: AppDimensions.cardElevation,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimensions.cardBorderRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppDimensions.cardPadding),
        child: Row(
          children: [
            // Document Icon
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: _getDocumentColor(document.type).withOpacity(0.1),
                borderRadius: BorderRadius.circular(AppDimensions.radiusMedium),
              ),
              child: Icon(
                _getDocumentIcon(document.type),
                color: _getDocumentColor(document.type),
                size: 28,
              ),
            ),
            const SizedBox(width: AppDimensions.md),
            
            // Document Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    document.name,
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Text(
                    document.description,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.textMuted,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: AppDimensions.xs),
                  Row(
                    children: [
                      _buildStatusBadge(document.status),
                      const SizedBox(width: AppDimensions.sm),
                      if (document.issueDate != null)
                        Text(
                          'Issued: ${_formatDate(document.issueDate!)}',
                          style: AppTextStyles.bodySmall.copyWith(
                            color: AppColors.textMuted,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            
            // Action Button
            if (canRequest)
              IconButton(
                icon: const Icon(Icons.add_circle_outline),
                onPressed: () => _requestDocument(document),
                color: AppColors.primary,
              )
            else if (document.status == 'Ready')
              IconButton(
                icon: const Icon(Icons.download),
                onPressed: () => _downloadDocument(document),
                color: AppColors.success,
              )
            else if (document.status == 'Pending')
              const Icon(
                Icons.hourglass_empty,
                color: AppColors.warning,
              )
            else
              const SizedBox.shrink(),
          ],
        ),
      ),
    );
  }

  Color _getDocumentColor(String type) {
    switch (type) {
      case 'certificate':
        return AppColors.primary;
      case 'form':
        return AppColors.info;
      case 'record':
        return AppColors.success;
      case 'report':
        return AppColors.warning;
      default:
        return AppColors.textMuted;
    }
  }

  IconData _getDocumentIcon(String type) {
    switch (type) {
      case 'certificate':
        return Icons.workspace_premium;
      case 'form':
        return Icons.description;
      case 'record':
        return Icons.folder;
      case 'report':
        return Icons.assessment;
      default:
        return Icons.insert_drive_file;
    }
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    
    switch (status) {
      case 'Ready':
        color = AppColors.success;
        break;
      case 'Pending':
        color = AppColors.warning;
        break;
      case 'Rejected':
        color = AppColors.error;
        break;
      default:
        color = AppColors.textMuted;
    }

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppDimensions.sm,
        vertical: AppDimensions.xs,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppDimensions.radiusSmall),
      ),
      child: Text(
        status,
        style: AppTextStyles.labelSmall.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  void _requestDocument(DocumentItem document) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Request Document'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'You are requesting:',
              style: AppTextStyles.bodyMedium,
            ),
            const SizedBox(height: AppDimensions.sm),
            Text(
              document.name,
              style: AppTextStyles.bodyMedium.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppDimensions.md),
            Text(
              'The document will be processed by the registrar office. You will be notified when it is ready for download.',
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.textMuted,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Request submitted for ${document.name}'),
                  backgroundColor: AppColors.success,
                ),
              );
            },
            child: const Text('Request'),
          ),
        ],
      ),
    );
  }

  void _downloadDocument(DocumentItem document) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Download Document'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Download:',
              style: AppTextStyles.bodyMedium,
            ),
            const SizedBox(height: AppDimensions.sm),
            Text(
              document.name,
              style: AppTextStyles.bodyMedium.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppDimensions.md),
            const CircularProgressIndicator(),
            const SizedBox(height: AppDimensions.md),
            Text(
              'Preparing download...',
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
    
    // Simulate download delay
    Future.delayed(const Duration(seconds: 2), () {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${document.name} downloaded successfully'),
          backgroundColor: AppColors.success,
        ),
      );
    });
  }

  List<DocumentItem> _getSampleAvailableDocuments() {
    return [
      DocumentItem(
        name: 'Certificate of Enrollment',
        description: 'Official proof of current enrollment',
        type: 'certificate',
        status: 'Available',
        issueDate: null,
      ),
      DocumentItem(
        name: 'Certificate of Grades',
        description: 'Official academic record transcript',
        type: 'record',
        status: 'Available',
        issueDate: null,
      ),
      DocumentItem(
        name: 'Honorable Dismissal',
        description: 'Certificate for transfer to other institution',
        type: 'certificate',
        status: 'Available',
        issueDate: null,
      ),
      DocumentItem(
        name: 'Good Moral Character',
        description: 'Character certificate for employment',
        type: 'certificate',
        status: 'Available',
        issueDate: null,
      ),
      DocumentItem(
        name: 'Student ID Form',
        description: 'Request form for student ID',
        type: 'form',
        status: 'Available',
        issueDate: null,
      ),
    ];
  }

  List<DocumentItem> _getSampleRequestedDocuments() {
    return [
      DocumentItem(
        name: 'Certificate of Enrollment',
        description: 'Official proof of current enrollment',
        type: 'certificate',
        status: 'Ready',
        issueDate: DateTime.now().subtract(const Duration(days: 2)),
      ),
    ];
  }
}

class DocumentItem {
  final String name;
  final String description;
  final String type;
  final String status;
  final DateTime? issueDate;

  DocumentItem({
    required this.name,
    required this.description,
    required this.type,
    required this.status,
    this.issueDate,
  });
}